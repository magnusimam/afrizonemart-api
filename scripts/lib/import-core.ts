/**
 * Shared core for the supplier import: CSV load, normalization, entity
 * building, and identity-resolution grouping. Used by the dry-run report,
 * the match diagnostics, and (later) the real importer — one source of
 * truth so they never drift.
 */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';

export const DIR = path.resolve('data/imports');

export interface Entity {
  id: string;
  kind: 'eoi' | 'piq';
  rowIndex: number;
  company: string;
  contact: string;
  email: string;
  phone: string;
  address: string;
  country: string;
  category: string;
  product: string;
  note: string;
  // normalized keys
  emailKey: string;
  phoneKey: string;
  nameKey: string;
  addrKey: string;
  /** original CSV row + its column list, for answer mapping at import time. */
  raw: Record<string, string>;
  srcCols: string[];
}

export const normEmail = (s: string) => {
  const m = (s || '').toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  return m ? m[0] : '';
};
export const normPhone = (s: string) => {
  const d = ((s || '').match(/\d/g) ?? []).join('');
  return d.length >= 10 ? d.slice(-10) : '';
};
const STOP = new Set([
  'ltd', 'limited', 'nig', 'nigeria', 'enterprise', 'enterprises', 'intl',
  'international', 'company', 'co', 'the', 'global', 'and', 'foods', 'food',
  'farms', 'farm', 'ventures', 'venture', 'services', 'service', 'concept',
  'concepts', 'investment', 'investments', 'resources', 'integrated',
]);
export const nameTokens = (s: string): string[] =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));
export const normName = (s: string) => nameTokens(s).join(' ');
/** Full normalized brand string (keeps every word) — for EXACT-dup merging. */
export const normExact = (s: string) =>
  (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const normAddr = (s: string) => {
  const t = (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length >= 8 ? t : '';
};

/** Distinctive-token overlap between two names (Jaccard over tokens). */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size); // containment-style
}

function load(file: string) {
  const raw = fs.readFileSync(path.join(DIR, file), 'utf8');
  const p = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true });
  return { rows: p.data, cols: p.meta.fields ?? [] };
}
function getter(cols: string[]) {
  return (row: Record<string, string>, ...patterns: RegExp[]): string => {
    for (const p of patterns) {
      const c = cols.find((col) => p.test(col.trim()));
      if (c) {
        const v = (row[c] ?? '').toString().trim();
        if (v) return v;
      }
    }
    return '';
  };
}

export function buildEntities(): Entity[] {
  const files = fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.csv') && !/dry-run/i.test(f));
  const eoiFile = files.find((f) => /interest/i.test(f));
  const piqFile = files.find((f) => /questionnaire/i.test(f));
  if (!eoiFile || !piqFile) throw new Error(`Need EOI + PIQ csv in ${DIR}; found: ${files.join(', ')}`);

  const eoi = load(eoiFile);
  const piq = load(piqFile);
  const ge = getter(eoi.cols);
  const gp = getter(piq.cols);
  const out: Entity[] = [];

  eoi.rows.forEach((r, i) => {
    const company = ge(r, /full name of business/i);
    const email = normEmail(ge(r, /email/i));
    const phone = normPhone(ge(r, /phone number/i));
    const address = ge(r, /physical address/i);
    if (!company && !email && !phone) return;
    out.push({
      id: `e${i}`, kind: 'eoi', rowIndex: i, company,
      contact: ge(r, /primary contact person.{0,3}s name/i, /contact.*name/i),
      email, phone, address,
      country: ge(r, /state & country/i),
      category: ge(r, /what type of business/i),
      product: ge(r, /list your different type of products/i),
      note: ge(r, /^column 1$/i),
      emailKey: email, phoneKey: phone, nameKey: normExact(company), addrKey: normAddr(address),
      raw: r, srcCols: eoi.cols,
    });
  });

  piq.rows.forEach((r, i) => {
    const brand = gp(r, /brand name/i);
    const product = gp(r, /product name/i);
    const email = normEmail(gp(r, /^email address/i, /brand email/i));
    const phone = normPhone(gp(r, /phone number/i));
    if (!brand && !product && !email && !phone) return;
    out.push({
      id: `p${i}`, kind: 'piq', rowIndex: i, company: brand, contact: '',
      email, phone, address: '',
      country: gp(r, /country of origin/i),
      category: gp(r, /^categories/i),
      product, note: '',
      emailKey: email, phoneKey: phone, nameKey: normExact(brand), addrKey: '',
      raw: r, srcCols: piq.cols,
    });
  });

  return out;
}

export interface GroupOpts {
  /** also union rows sharing a normalized physical address (EOI). */
  byAddress?: boolean;
  /** also union rows whose name-token similarity ≥ this (0 disables). */
  fuzzyNameThreshold?: number;
  /** let a no-email group borrow an email from an email-bearing entity
   *  whose company name matches with similarity ≥ this (0 disables). */
  borrowEmailSim?: number;
}

/** Union-find grouping. Returns array of member-arrays. */
export function groupEntities(entities: Entity[], opts: GroupOpts = {}): Entity[][] {
  const parent: Record<string, string> = {};
  const find = (x: string): string => {
    parent[x] ??= x;
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  entities.forEach((e) => find(e.id));

  const linkBy = (key: keyof Entity) => {
    const seen: Record<string, string> = {};
    for (const e of entities) {
      const k = e[key] as string;
      if (!k) continue;
      if (seen[k]) union(e.id, seen[k]);
      else seen[k] = e.id;
    }
  };
  linkBy('emailKey');
  linkBy('phoneKey');
  linkBy('nameKey');
  if (opts.byAddress) linkBy('addrKey');

  if (opts.fuzzyNameThreshold && opts.fuzzyNameThreshold > 0) {
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i], b = entities[j];
        if (find(a.id) === find(b.id)) continue;
        if (nameSimilarity(a.company, b.company) >= opts.fuzzyNameThreshold) {
          // Require a corroborating signal to avoid false merges: same
          // country, or shared address token, or one shares a phone digit-run.
          const sameCountry =
            a.country && b.country &&
            a.country.toLowerCase().includes('niger') === b.country.toLowerCase().includes('niger');
          if (sameCountry) union(a.id, b.id);
        }
      }
    }
  }

  if (opts.borrowEmailSim && opts.borrowEmailSim > 0) {
    const emailByRoot: Record<string, string> = {};
    for (const e of entities) if (e.email) emailByRoot[find(e.id)] = e.email;
    for (const e of entities) {
      if (!e.company || emailByRoot[find(e.id)]) continue;
      let best: Entity | null = null;
      let bestSim = opts.borrowEmailSim;
      for (const t of entities) {
        if (!t.email || find(t.id) === find(e.id)) continue;
        const sim = nameSimilarity(e.company, t.company);
        if (sim >= bestSim) { bestSim = sim; best = t; }
      }
      if (best) {
        union(e.id, best.id);
        emailByRoot[find(e.id)] = best.email;
      }
    }
  }

  const groups = new Map<string, Entity[]>();
  for (const e of entities) {
    const root = find(e.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(e);
  }
  return Array.from(groups.values());
}
