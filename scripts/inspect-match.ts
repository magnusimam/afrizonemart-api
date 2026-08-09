/* Crack the EOI<->PIQ matching key. */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';

const DIR = path.resolve('data/imports');
const files = fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.csv'));
const eoiFile = files.find((f) => /interest/i.test(f))!;
const piqFile = files.find((f) => /questionnaire/i.test(f))!;

function load(file: string) {
  const raw = fs.readFileSync(path.join(DIR, file), 'utf8');
  const p = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true });
  return { rows: p.data, cols: p.meta.fields ?? [] };
}

const eoi = load(eoiFile);
const piq = load(piqFile);

console.log('\n===== PIQ — ALL 73 COLUMNS =====');
piq.cols.forEach((c, i) => console.log(`  [${i}] ${JSON.stringify(c).slice(0, 80)}`));

console.log('\n===== PIQ — columns that contain an email (@) in first 60 rows =====');
for (const c of piq.cols) {
  const hits = piq.rows.slice(0, 60).filter((r) => /@/.test(r[c] ?? '')).length;
  if (hits > 0) console.log(`  "${c.trim().slice(0, 50)}" → ${hits} rows with '@'`);
}

const showCol = (rows: Record<string, string>[], col: string, n = 15) => {
  console.log(`\n--- first ${n} values of "${col.trim()}" ---`);
  rows.slice(0, n).forEach((r, i) => console.log(`  ${i}: ${JSON.stringify((r[col] ?? '').slice(0, 70))}`));
};

if (eoi.cols.includes('Column 1')) showCol(eoi.rows, 'Column 1');
if (piq.cols.includes('Column 1')) showCol(piq.rows, 'Column 1');

// Brand + Product + Country to see if PIQ identifies a company
const piqBrand = piq.cols.find((c) => /brand name/i.test(c));
const piqProduct = piq.cols.find((c) => /product name/i.test(c));
if (piqBrand) showCol(piq.rows, piqBrand);
if (piqProduct) showCol(piq.rows, piqProduct);

// EOI company + email for reference
const eoiCompany = eoi.cols.find((c) => /full name of business/i.test(c));
const eoiEmail = eoi.cols.find((c) => /email/i.test(c));
if (eoiCompany) showCol(eoi.rows, eoiCompany);
if (eoiEmail) showCol(eoi.rows, eoiEmail);
