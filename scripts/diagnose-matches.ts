/* Deep-dive the flagged groups: try to resolve no-email + multi-email via
 * phone / address / name cross-reference before we give up on any. */
import { buildEntities, groupEntities, nameSimilarity, type Entity } from './lib/import-core';

const entities = buildEntities();
const groups = groupEntities(entities); // conservative grouping (email/phone/name)

const emailsOf = (m: Entity[]) => Array.from(new Set(m.map((e) => e.email).filter(Boolean)));
const nameOf = (m: Entity[]) =>
  m.find((e) => e.kind === 'eoi' && e.company)?.company || m.find((e) => e.company)?.company || '(no name)';

console.log('\n###################  NO-EMAIL GROUPS  ###################');
const noEmail = groups.filter((m) => emailsOf(m).length === 0);
console.log(`(${noEmail.length} groups with no email at all)\n`);
for (const m of noEmail) {
  const phone = m.find((e) => e.phone)?.phone || '';
  const addr = m.find((e) => e.address)?.address || '';
  console.log(`• ${nameOf(m)}  [${m.map((e) => e.kind).join(',')}]  phone:${phone || '—'}`);
  if (addr) console.log(`    addr: ${addr.slice(0, 70)}`);
  if (m.some((e) => e.kind === 'piq')) console.log(`    products: ${m.filter((e)=>e.kind==='piq').map((e)=>e.product).filter(Boolean).join(', ').slice(0,90)}`);
  // Try to find an email-bearing entity elsewhere that looks like this one.
  const suggestions = entities
    .filter((e) => e.email)
    .map((e) => {
      let why = '';
      if (phone && e.phone === phone) why = 'SAME PHONE';
      else {
        const sim = nameSimilarity(nameOf(m), e.company);
        if (sim >= 0.5) why = `name~${sim.toFixed(2)}`;
      }
      return why ? { e, why } : null;
    })
    .filter(Boolean) as { e: Entity; why: string }[];
  const seen = new Set<string>();
  for (const s of suggestions) {
    if (seen.has(s.e.email)) continue;
    seen.add(s.e.email);
    console.log(`    ↳ maybe: ${s.e.company} <${s.e.email}> (${s.why})`);
  }
  if (!suggestions.length) console.log('    ↳ no email anywhere — list for manual review');
  console.log('');
}

console.log('\n###################  MULTI-EMAIL GROUPS  ###################');
const multi = groups.filter((m) => emailsOf(m).length > 1);
console.log(`(${multi.length} groups with >1 distinct email)\n`);
for (const m of multi) {
  const emails = emailsOf(m);
  const phones = Array.from(new Set(m.map((e) => e.phone).filter(Boolean)));
  const names = Array.from(new Set(m.map((e) => e.company).filter(Boolean)));
  // Verdict: shared phone OR consistent names ⇒ same company (oversight).
  const namePairsConsistent = names.length <= 1 || names.every((n) => nameSimilarity(n, names[0]) >= 0.5);
  const verdict = phones.length === 1 ? 'SAME PHONE → likely one company (oversight)'
    : namePairsConsistent ? 'consistent names → likely one company'
    : '⚠ names AND phones differ → possible OVER-MERGE, review';
  console.log(`• ${nameOf(m)}`);
  console.log(`    emails: ${emails.join('  |  ')}`);
  console.log(`    phones: ${phones.join('  |  ') || '—'}`);
  console.log(`    names : ${names.join('  |  ')}`);
  console.log(`    verdict: ${verdict}\n`);
}
