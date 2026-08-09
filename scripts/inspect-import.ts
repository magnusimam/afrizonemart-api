/* One-off: inspect the dropped CSV exports (headers, counts, samples). */
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';

const DIR = path.resolve('data/imports');

function inspect(file: string) {
  const full = path.join(DIR, file);
  const raw = fs.readFileSync(full, 'utf8');
  const parsed = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
  });
  const rows = parsed.data;
  const cols = parsed.meta.fields ?? [];
  console.log('\n========================================================');
  console.log('FILE:', file);
  console.log('ROWS:', rows.length, '| COLUMNS:', cols.length);
  console.log('--- COLUMNS ---');
  cols.forEach((c, i) => console.log(`  [${i}] ${c}`));
  console.log('--- SAMPLE ROW (first non-empty, values truncated) ---');
  const sample = rows[0] ?? {};
  for (const k of cols) {
    const v = (sample[k] ?? '').toString().replace(/\s+/g, ' ').slice(0, 90);
    if (v) console.log(`  ${k}: ${v}`);
  }
}

const files = fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.csv'));
for (const f of files) inspect(f);
