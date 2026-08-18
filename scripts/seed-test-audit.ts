/**
 * Seed a COMPLETED-but-unauthorised audit against the Adia Foods demo
 * supplier, so the release path can be exercised without hand-rating 43
 * checkpoints first.
 *
 *   npx tsx scripts/seed-test-audit.ts
 *   npx tsx scripts/seed-test-audit.ts --remove
 *
 * TEST DATA. Everything it writes is marked `[TEST DATA]` in the audit summary
 * and is removed in full by `--remove`. It refuses to touch a supplier other
 * than the seeded demo account, and refuses to overwrite an audit that has
 * already been authorised.
 *
 * It stops one step short of authorising on purpose: authorising is the step
 * that renders the PDF and emails a real address, so it stays a deliberate
 * click rather than something a seed script does on your behalf.
 *
 * The checklist and score come from the real resolver and the real scorer, not
 * from hand-written JSON — a fixture that bypassed them would test nothing.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import { refuseOnProduction } from './lib/refuse-on-production';
import { getProtocol } from '../src/modules/suppliers/assessment/protocols';
import { resolveChecklist } from '../src/modules/suppliers/assessment/resolver';
import { emptyProfile, type AssessmentProfile } from '../src/modules/suppliers/assessment/profile';
import { scoreAssessment, type AssessmentResponse } from '../src/modules/suppliers/assessment/scoring';

const prisma = new PrismaClient();

const SUPPLIER_EMAIL = 'adia@adiafoods.ng';
const PROTOCOL_CODE = 'AFZ-QA-FPS-001';
const MARKER = '[TEST DATA]';

/**
 * Adia Foods as a cassava-and-maize flour producer.
 *
 * Chosen to light up the conditional rules rather than to be flattering: the
 * cassava triggers HCN reduction (D.4) and batch testing (F.3), the maize
 * triggers aflatoxin screening (C.3, F.2), fermentation triggers D.6, and the
 * shared line plus soy triggers allergen segregation (D.3). A plain
 * single-substrate profile would exercise almost none of the engine.
 */
const PROFILE: AssessmentProfile = {
  ...emptyProfile('flour-staple'),
  substrates: ['cassava', 'maize', 'soy'],
  processes: ['drying', 'milling', 'fermentation', 'sieving'],
  labelClaims: [],
  allergensPresent: ['soy'],
  sharedProductionLines: true,
  targetMarkets: ['domestic-NG'],
  packagingTypes: ['flexible-film'],
  metalContactSteps: true,
  waterUsedInProcess: true,
  confirmedBySupplierAt: new Date().toISOString(),
};

/**
 * Deliberate findings, modelled on the shipped Eden Foods report: a facility
 * that is broadly sound but blocked by the two universal Criticals. Everything
 * not listed here is rated Compliant.
 *
 * This shape is the interesting one to test against — a high indicative score
 * with a REJECTED outcome is exactly the case a supplier misreads, and it is
 * what the report's methodology note exists to explain.
 */
const FINDINGS: Record<string, AssessmentResponse & { findings?: string; statusNote?: string; justification?: string }> = {
  'B.4': {
    rating: 'C',
    findings: 'NO METAL DETECTOR ON THE MILLING LINE',
    statusNote: 'Absent — Non-Negotiable',
  },
  'J.2': {
    rating: 'C',
    findings: 'NO WRITTEN RECALL SOP; NO DRILL ON RECORD',
    statusNote: 'Absent — Non-Negotiable',
  },
  'A.4': {
    rating: 'M',
    majorPoints: 2,
    findings: 'NOT YET, IN VIEW',
    statusNote: 'Not yet — in preparation',
  },
  'C.3': {
    rating: 'M',
    majorPoints: 3,
    findings: 'GRADING BY EYE AT INTAKE; NO AFLATOXIN TEST RECORDS',
    statusNote: 'Grading-based, supplier-history driven',
  },
  'D.6': {
    rating: 'M',
    majorPoints: 2,
    findings: 'FERMENTATION VESSELS IN USE BUT NOTHING LOGGED',
    statusNote: 'Vessels in use; no logging',
  },
  'I.2': { rating: 'Mi', findings: 'NO HUMIDITY LOG IN FINISHED GOODS STORE', statusNote: 'Monitoring gap' },
  'J.3': { rating: 'Mi', findings: 'COMPLAINTS TRACKED IN A WHATSAPP GROUP', statusNote: 'Business group chat used' },
  'J.1': { rating: 'O', findings: 'TRAINING HAPPENS BUT IS NOT DOCUMENTED', statusNote: 'Practised informally' },
  'G.3': { rating: 'O', findings: 'SHELF LIFE ASSERTED, NO STABILITY DATA', statusNote: 'No stability data' },
};

async function main() {
  refuseOnProduction('seed-test-audit');

  const user = await prisma.user.findUnique({
    where: { email: SUPPLIER_EMAIL },
    include: { supplierProfile: true },
  });
  if (!user?.supplierProfile) {
    console.error(`No supplier profile for ${SUPPLIER_EMAIL}. Run scripts/seed-supplier.ts first.`);
    process.exit(1);
  }
  const supplierId = user.supplierProfile.id;

  if (process.argv.includes('--remove')) {
    const existing = await prisma.supplierAudit.findUnique({ where: { supplierId } });
    if (!existing) {
      console.log('Nothing to remove — no audit on the demo supplier.');
      return;
    }
    if (!existing.summary?.includes(MARKER)) {
      console.error('Refusing to remove: this audit is not marked as test data.');
      process.exit(1);
    }
    await prisma.supplierAudit.delete({ where: { supplierId } });
    console.log('✓ Removed the test audit.');
    return;
  }

  const existing = await prisma.supplierAudit.findUnique({ where: { supplierId } });
  if (existing?.approvedAt) {
    console.error(
      'Refusing to overwrite: this audit has already been authorised and released.\n'
      + 'Run with --remove first if you genuinely want to start over.',
    );
    process.exit(1);
  }

  const protocol = getProtocol(PROTOCOL_CODE);
  if (!protocol) {
    console.error(`Protocol ${PROTOCOL_CODE} not found.`);
    process.exit(1);
  }

  // The real resolver, so the snapshot is exactly what the endpoint would store.
  const checklist = resolveChecklist(protocol, PROFILE);

  const responses: Record<string, unknown> = {};
  for (const item of checklist.items) {
    responses[item.ref] = FINDINGS[item.ref] ?? { rating: 'Cpt', statusNote: 'Verified on-site' };
  }

  // The real scorer, so the stored score matches what completing would compute.
  const { counts, indicativeScore, outcome } = scoreAssessment(
    responses as Record<string, AssessmentResponse>,
  );

  const data = {
    status: 'COMPLETED' as const,
    category: 'A',
    protocolCode: protocol.code,
    protocolVersion: protocol.version,
    reportSlug: 'ADIA',
    checklistSnapshot: checklist as unknown as Prisma.InputJsonValue,
    assessmentProfile: PROFILE as unknown as Prisma.InputJsonValue,
    responses: responses as Prisma.InputJsonValue,
    counts: counts as unknown as Prisma.InputJsonValue,
    indicativeScore,
    outcome,
    conductedAt: new Date(),
    auditorName: 'Test Assessor',
    summary:
      `${MARKER} Seeded audit for exercising the release path. `
      + 'Adia Foods assessed against the flours protocol as a cassava, maize and '
      + 'soya producer. Blocked by the two universal Critical findings.',
    // Deliberately no approvedAt/signedBy — authorising is the thing under test.
    approvedAt: null,
    approvedById: null,
    signedBy: null,
  };

  await prisma.supplierAudit.upsert({
    where: { supplierId },
    update: data,
    create: { supplierId, ...data },
  });

  // Stage 6 so the supplier shows up in the audit queue.
  if (user.supplierProfile.currentStage < 6) {
    await prisma.supplierProfile.update({ where: { id: supplierId }, data: { currentStage: 6 } });
  }

  const excluded = checklist.excluded.length;
  console.log(`✓ Seeded test audit for Adia Foods (${supplierId})`);
  console.log(`  protocol      ${protocol.code} v${protocol.version}`);
  console.log(`  checklist     ${checklist.items.length} applicable, ${excluded} excluded by profile`);
  console.log(`  findings      ${counts.critical}C ${counts.major}M ${counts.minor}Mi ${counts.observation}O ${counts.compliant}Cpt`);
  console.log(`  score         ${indicativeScore}/100 → ${outcome}`);
  console.log('  state         COMPLETED, awaiting authorisation');
  console.log('');
  console.log('  Authorise in the admin UI to render the PDF and send the emails.');
  console.log('  Remove with: npx tsx scripts/seed-test-audit.ts --remove');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
