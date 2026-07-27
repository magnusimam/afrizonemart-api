/**
 * Drive → R2 image migration for bulk-imported suppliers.
 *
 * The EOI/PIQ images came in as Google Drive links (Google Forms file uploads)
 * stored in:
 *   - SupplierProfile.eoiAnswers / stageAnswers   (e.g. product_images)
 *   - ProductPIQ.answers                          (e.g. product_image)
 * Many fields hold several comma/space-separated links.
 *
 * This script deep-walks those JSON blobs, downloads each Drive file, re-hosts
 * it through the normal uploads service (local disk in dev, Cloudflare R2 in
 * prod — whatever UPLOADS_BACKEND is), and rewrites the stored URL in place.
 *
 *   npx tsx scripts/migrate-drive-images.ts                 # DRY RUN (default)
 *   npx tsx scripts/migrate-drive-images.ts --commit        # download + rewrite
 *   npx tsx scripts/migrate-drive-images.ts --limit=5       # cap files (testing)
 *
 * SOURCE ACCESS: Google Forms uploads are private. Either
 *   (a) share the responses Drive folder as "anyone with the link", or
 *   (b) set GDRIVE_TOKEN to an OAuth access token / service-account token with
 *       drive.readonly scope — the script then pulls via the Drive API.
 * DESTINATION: set UPLOADS_BACKEND=r2 + R2_* envs to land files in R2.
 */
import { writeFileSync } from 'node:fs';
import { prisma } from '@/infra/prisma';
import { uploadImage, putRaw } from '@/modules/uploads/service';

const COMMIT = process.argv.includes('--commit');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.slice('--limit='.length)) : Infinity;
const TOKEN = process.env.GDRIVE_TOKEN;

const DRIVE_RX = /https?:\/\/(?:drive|docs)\.google\.com\/[^\s,"']+|https?:\/\/drive\.usercontent\.google\.com\/[^\s,"']+/gi;

function driveId(url: string): string | null {
  return (
    url.match(/[?&]id=([\w-]+)/)?.[1] ??
    url.match(/\/d\/([\w-]+)/)?.[1] ??
    null
  );
}

/** Download a Drive file → {buffer, mimeType}. Throws on failure.
 *  Handles Google's "can't scan for viruses" interstitial (HTML form with a
 *  confirm token) by re-submitting it. Falls back to the Drive API if a token
 *  is provided. */
async function downloadDrive(id: string): Promise<{ buffer: Buffer; mimeType: string }> {
  if (TOKEN) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) throw new Error(`Drive API HTTP ${res.status}`);
    const ct = res.headers.get('content-type') ?? '';
    return { buffer: Buffer.from(await res.arrayBuffer()), mimeType: ct.split(';')[0] || 'image/jpeg' };
  }

  let res = await fetch(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`, { redirect: 'follow' });
  let ct = res.headers.get('content-type') ?? '';
  if (ct.includes('text/html')) {
    // Interstitial page — rebuild the GET from its hidden form inputs.
    const html = await res.text();
    const params = new URLSearchParams();
    for (const m of html.matchAll(/name="([^"]+)"\s+value="([^"]*)"/g)) params.set(m[1], m[2]);
    if (!params.get('id')) throw new Error('not accessible (no download form — check folder sharing)');
    const action = html.match(/action="([^"]+)"/)?.[1] ?? 'https://drive.usercontent.google.com/download';
    res = await fetch(`${action.replace(/&amp;/g, '&')}?${params.toString()}`, { redirect: 'follow' });
    ct = res.headers.get('content-type') ?? '';
    if (ct.includes('text/html')) throw new Error('still HTML after confirm (not accessible)');
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { buffer: Buffer.from(await res.arrayBuffer()), mimeType: ct.split(';')[0] || 'image/jpeg' };
}

const cache = new Map<string, string>(); // driveUrl -> newUrl
let downloaded = 0;
let failed = 0;
const report: string[] = ['entity,field,driveUrl,status,newUrl'];

/** CSV-safe row (quote every field; company names contain commas). */
function row(entity: string, field: string, url: string, status: string, newUrl = ''): void {
  report.push([entity, field, url, status, newUrl].map((c) => `"${(c ?? '').replace(/"/g, '""')}"`).join(','));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resolve one Drive URL to a re-hosted URL (cached, dry-run aware). */
async function migrateUrl(driveUrl: string, ctx: string, field: string): Promise<string> {
  if (cache.has(driveUrl)) return cache.get(driveUrl)!;
  const id = driveId(driveUrl);
  if (!id) { row(ctx, field, driveUrl, 'no-id'); return driveUrl; }
  if (!COMMIT) { row(ctx, field, driveUrl, 'would-migrate'); return driveUrl; }
  if (downloaded >= LIMIT) { row(ctx, field, driveUrl, 'skipped-limit'); return driveUrl; }
  try {
    await sleep(120); // be gentle on Google for the full run
    const { buffer, mimeType } = await downloadDrive(id);
    let url: string;
    try {
      // Strict image path (sniff + optimise) for normal product photos.
      ({ url } = await uploadImage({ buffer, mimeType, size: buffer.length, folder: 'products', originalName: `${id}` }));
    } catch {
      // Documents (PDF), phone formats (HEIC), or oversized originals — preserve
      // them as-is rather than dropping them.
      ({ url } = await putRaw({ buffer, mimeType, folder: 'misc' }));
    }
    cache.set(driveUrl, url);
    downloaded++;
    row(ctx, field, driveUrl, 'migrated', url);
    return url;
  } catch (e) {
    failed++;
    row(ctx, field, driveUrl, `FAILED:${e instanceof Error ? e.message : e}`);
    return driveUrl;
  }
}

/** Deep-walk a JSON value, replacing Drive URLs inside any string. Returns the
 *  (possibly new) value and whether anything changed. */
async function walk(value: unknown, ctx: string, field: string): Promise<{ value: unknown; changed: boolean }> {
  if (typeof value === 'string') {
    if (!DRIVE_RX.test(value)) return { value, changed: false };
    DRIVE_RX.lastIndex = 0;
    const urls = value.match(DRIVE_RX) ?? [];
    let out = value;
    for (const u of urls) {
      const nu = await migrateUrl(u, ctx, field);
      if (nu !== u) out = out.split(u).join(nu);
    }
    return { value: out, changed: out !== value };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const arr = [];
    for (const v of value) { const r = await walk(v, ctx, field); arr.push(r.value); changed = changed || r.changed; }
    return { value: arr, changed };
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) { const r = await walk(v, ctx, k); obj[k] = r.value; changed = changed || r.changed; }
    return { value: obj, changed };
  }
  return { value, changed: false };
}

async function main() {
  console.log(`Drive → R2 image migration — ${COMMIT ? 'COMMIT' : 'DRY RUN'}${TOKEN ? ' (Drive API token set)' : ' (public-download mode)'}`);

  // Suppliers
  const suppliers = await prisma.supplierProfile.findMany({ select: { id: true, companyName: true, eoiAnswers: true, stageAnswers: true } });
  let supChanged = 0;
  for (const s of suppliers) {
    const eoi = await walk(s.eoiAnswers, s.companyName, 'eoiAnswers');
    const stage = await walk(s.stageAnswers, s.companyName, 'stageAnswers');
    if ((eoi.changed || stage.changed) && COMMIT) {
      await prisma.supplierProfile.update({
        where: { id: s.id },
        data: {
          ...(eoi.changed ? { eoiAnswers: eoi.value as object } : {}),
          ...(stage.changed ? { stageAnswers: stage.value as object } : {}),
        },
      });
      supChanged++;
    }
  }

  // PIQs
  const piqs = await prisma.productPIQ.findMany({ select: { id: true, name: true, answers: true } });
  let piqChanged = 0;
  for (const q of piqs) {
    const r = await walk(q.answers, `PIQ:${q.name}`, 'answers');
    if (r.changed && COMMIT) {
      await prisma.productPIQ.update({ where: { id: q.id }, data: { answers: r.value as object } });
      piqChanged++;
    }
  }

  const wouldOrDid = report.filter((r) => /"(would-migrate|migrated)"/.test(r)).length;
  writeFileSync('data/imports/drive-migration-report.csv', report.join('\n'), 'utf8');

  console.log('\n================ SUMMARY ================');
  console.log(`Drive links found: ${wouldOrDid}`);
  if (COMMIT) {
    console.log(`Downloaded + re-hosted: ${downloaded} · failed: ${failed}`);
    console.log(`Suppliers updated: ${supChanged} · PIQs updated: ${piqChanged}`);
  } else {
    console.log('(DRY RUN — nothing downloaded or written. Re-run with --commit.)');
  }
  console.log('Report → data/imports/drive-migration-report.csv');
  await prisma.$disconnect();
}

main().catch((err) => { console.error('migration failed:', err); process.exit(1); });
