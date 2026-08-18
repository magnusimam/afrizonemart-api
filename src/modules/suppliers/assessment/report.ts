import type { Protocol } from './catalogue';
import {
  buildDashboard, buildRoadmap, complianceStrengths, deriveFindings, majorsAsCards,
  type DashboardRow, type Finding, type RoadmapPhase,
} from './findings';
import type { ResolvedChecklist } from './resolver';
import {
  APPROVED_THRESHOLD, MAX_MAJORS_FOR_APPROVAL, PROVISIONAL_THRESHOLD,
  scoreAssessment, type AssessmentResponse, type Outcome, type ScoreResult,
} from './scoring';

/**
 * The Conformity Diagnostic Report, as a data model.
 *
 * Deliberately not HTML. The same structure feeds the supplier's portal view
 * and the PDF that gets emailed, so the two cannot drift — which is the whole
 * reason for rendering the PDF from the portal's own markup rather than
 * maintaining a second layout.
 *
 * WHAT IS AND ISN'T GENERATED. Measured against the four shipped reports, the
 * document is roughly 20% boilerplate, 68% templated and 12% genuinely
 * authored. Everything in here is the first two. The authored remainder — the
 * executive-summary narrative, the conditional callouts and the §9 decision
 * paragraph, about 800–1,100 words — is drafted separately and presented to the
 * auditor to edit before they authorise. Those slots appear below as
 * `AuthoredSlot`s, empty until filled.
 *
 * BRITISH SPELLING throughout, matching the shipped reports: practised,
 * formalise, programme, colour. Never American.
 */

/** A passage a human writes or approves. Never invented silently. */
export interface AuthoredSlot {
  /** What this passage has to do, shown to the auditor as a prompt. */
  brief: string;
  /** Draft text, if one has been generated. */
  draft: string;
  /** Set once a human has read it. Authorisation is blocked until all are. */
  approved: boolean;
}

const slot = (brief: string): AuthoredSlot => ({ brief, draft: '', approved: false });

export interface ReportMeta {
  documentCode: string;
  protocolCode: string;
  protocolName: string;
  protocolVersion: string;
  supplierName: string;
  supplierSlug: string;
  productDescriptor: string;
  assessmentType: string;
  reportVersion: string;
  issueDate: string;
  classification: string;
  preparedBy: string;
}

export interface ScoreStrip {
  indicativeScore: number;
  critical: number;
  major: number;
  minor: number;
  observation: number;
  compliant: number;
  notApplicable: number;
}

export interface CapaRow {
  ref: string;
  severity: string;
  nonConformity: string;
  owner: string;
  deadlineDays: number;
  dueDate: string;
  /** Emitted blank — the supplier completes these before re-assessment. */
  rootCause: '';
  evidence: '';
}

export interface DiagnosticReport {
  meta: ReportMeta;
  executiveSummary: {
    outcome: Outcome;
    outcomeLabel: string;
    scoreStrip: ScoreStrip;
    /** The methodology explainer, stated to the supplier. */
    methodologyNote: string;
    outcomeReason: AuthoredSlot;
    headlineFindings: AuthoredSlot;
    whatThisMeans: AuthoredSlot;
  };
  methodology: {
    intro: string;
    scoringLegend: { severity: string; weight: string; definition: string }[];
    workedArithmetic: string;
  };
  dashboard: DashboardRow[];
  findings: {
    intro: string;
    majorsAsCards: boolean;
    critical: Finding[];
    major: Finding[];
    minor: Finding[];
    observation: Finding[];
  };
  complianceStrengths: { ref: string; section: string; text: string }[];
  roadmap: RoadmapPhase[];
  capa: { intro: string; rows: CapaRow[] };
  decision: {
    banner: string;
    narrative: AuthoredSlot;
    milestones: { day: string; owner: string; action: string }[];
    conditions: string[];
  };
  signOff: { statement: string; blocks: string[] };
}

/**
 * The scoring legend, printed in every report so the supplier can see how the
 * score was reached. Byte-identical across all four shipped reports and both
 * protocols — hard-coded rather than derived.
 */
export const SCORING_LEGEND = [
  { severity: 'Critical [C]', weight: '0',
    definition: 'Immediate safety, legal or ethical violation. Blocks onboarding. Mandatory CAPA and full re-audit required.' },
  { severity: 'Major [M]', weight: '1 – 3 per finding',
    definition: 'Significant control gap. CAPA within 90 days. No more than three permitted for any approval outcome.' },
  { severity: 'Minor [Mi]', weight: '0.5 per finding',
    definition: 'Isolated non-critical deviation. CAPA within 60 days. Does not block onboarding on its own.' },
  { severity: 'Observation [O]', weight: '0 (advisory)',
    definition: 'Best-practice gap. No formal CAPA. Encouraged for export readiness and global market acceptance.' },
  { severity: 'Compliant [Cpt]', weight: '—',
    definition: 'Fully meets the requirement; adequate objective evidence on file.' },
] as const;

const OUTCOME_LABEL: Record<Outcome, string> = {
  REJECTED: 'REJECTED — Immediate Fail',
  PROVISIONAL: 'PROVISIONAL — Conditional Approval',
  APPROVED: 'APPROVED — Listing Cleared',
};

export interface BuildReportInput {
  protocol: Protocol;
  checklist: ResolvedChecklist;
  responses: Record<string, AssessmentResponse & { justification?: string; statusNote?: string; findings?: string }>;
  supplierName: string;
  supplierSlug: string;
  productDescriptor: string;
  issuedAt: Date;
  reportSequence?: number;
}

export function buildReport(input: BuildReportInput): DiagnosticReport {
  const { protocol, checklist, responses, issuedAt } = input;

  const score = scoreAssessment(responses);
  const findings = deriveFindings(checklist, responses, { issuedAt });
  const bySeverity = (s: Finding['severity']) => findings.filter((f) => f.severity === s);
  const cards = majorsAsCards(findings);

  return {
    meta: buildMeta(input),
    executiveSummary: {
      outcome: score.outcome,
      outcomeLabel: OUTCOME_LABEL[score.outcome],
      scoreStrip: {
        indicativeScore: score.indicativeScore,
        critical: score.counts.critical,
        major: score.counts.major,
        minor: score.counts.minor,
        observation: score.counts.observation,
        compliant: score.counts.compliant,
        notApplicable: score.counts.na + checklist.excluded.length,
      },
      methodologyNote: methodologyNote(score),
      outcomeReason: slot(
        'One or two sentences naming which findings drive this outcome, and whether the supplier is well placed for a fast re-assessment.',
      ),
      headlineFindings: slot(
        'Three to six bullets re-voicing the Critical findings and the most consequential Majors, plus any scope or protocol-fit concern.',
      ),
      whatThisMeans: slot(
        `Two paragraphs for ${input.supplierName}: what they already do well, what specifically blocks listing, and how much work closure represents.`,
      ),
    },
    methodology: {
      intro:
        'This assessment was carried out against Protocol '
        + `${protocol.code} (${protocol.name}, version ${protocol.version}). `
        + 'Each applicable checkpoint was inspected on site and rated against the '
        + 'risk-based scale below. Checkpoints that do not apply to this product '
        + 'are listed with the reason they were excluded.',
      scoringLegend: SCORING_LEGEND.map((l) => ({ ...l })),
      workedArithmetic: workedArithmetic(score),
    },
    dashboard: buildDashboard(checklist, responses),
    findings: {
      intro: findingsIntro(cards),
      majorsAsCards: cards,
      critical: bySeverity('C'),
      major: bySeverity('M'),
      minor: bySeverity('Mi'),
      observation: bySeverity('O'),
    },
    complianceStrengths: complianceStrengths(checklist, responses),
    roadmap: buildRoadmap(findings),
    capa: {
      intro:
        'The CAPA tracker below is the formal close-out instrument for this '
        + `assessment. ${input.supplierName}'s QA owner must complete the root-cause `
        + 'and evidence columns and submit the closed tracker to Afrizonemart QA '
        + 'prior to re-assessment.',
      rows: findings.map(toCapaRow),
    },
    decision: {
      banner: decisionBanner(score, protocol),
      narrative: slot(
        'One paragraph: what drives this outcome, how the Major count compares with the maximum of three, and an honest read on how difficult remediation will be.',
      ),
      milestones: milestones(input.supplierName, findings),
      conditions: conditions(score, findings),
    },
    signOff: {
      statement:
        `This report is issued to ${input.supplierName} and to designated `
        + 'Afrizonemart partners. It records the facility’s conformity status as at '
        + `${formatDate(issuedAt)} and does not constitute certification.`,
      blocks: ['Lead Auditor', 'Afrizonemart Standards & Quality Assurance', 'Supplier Representative'],
    },
  };
}

/** Every authored slot must be read before the report can be released. */
export function unapprovedSlots(report: DiagnosticReport): string[] {
  const slots: [string, AuthoredSlot][] = [
    ['executive summary — outcome reason', report.executiveSummary.outcomeReason],
    ['executive summary — headline findings', report.executiveSummary.headlineFindings],
    ['executive summary — what this means', report.executiveSummary.whatThisMeans],
    ['final decision narrative', report.decision.narrative],
  ];
  return slots.filter(([, s]) => !s.approved || !s.draft.trim()).map(([name]) => name);
}

function buildMeta(input: BuildReportInput): ReportMeta {
  const seq = String(input.reportSequence ?? 1).padStart(3, '0');
  return {
    // <PROTOCOL-CODE> / DR-<SUPPLIER-SLUG>-<SEQ>, per the shipped reports.
    // The slug is stored, never derived: the real reports are inconsistent
    // (Eden Foods -> EDEN, Oluwatoyin Integrated Farms -> ZAO).
    documentCode: `${input.protocol.code} / DR-${input.supplierSlug.toUpperCase()}-${seq}`,
    protocolCode: input.protocol.code,
    protocolName: input.protocol.name,
    protocolVersion: input.protocol.version,
    supplierName: input.supplierName,
    supplierSlug: input.supplierSlug,
    productDescriptor: input.productDescriptor,
    assessmentType: 'Pre-Onboarding Conformity Diagnostic',
    reportVersion: '1.0',
    issueDate: formatDate(input.issuedAt),
    classification: 'Confidential — Restricted Distribution',
    preparedBy: 'Afrizonemart Standards & Quality Assurance Department',
  };
}

/**
 * The sentence that explains to the supplier why a high score can still fail.
 * Load-bearing: Eden Foods scored 91 and was rejected, and without this the
 * report reads as self-contradictory.
 */
function methodologyNote(score: ScoreResult): string {
  const base = `The indicative score of ${score.indicativeScore}/100 reflects `
    + 'mid-range deductions for Major and Minor findings alone.';
  if (score.counts.critical > 0) {
    return `${base} Per Section 8 of the protocol, the presence of any single `
      + 'Critical finding triggers an immediate failure regardless of total score. '
      + `This assessment records ${count(score.counts.critical, 'Critical finding')}.`;
  }
  if (score.counts.major > MAX_MAJORS_FOR_APPROVAL) {
    return `${base} No more than ${MAX_MAJORS_FOR_APPROVAL} Major findings are `
      + `permitted for any approval outcome; this assessment records ${score.counts.major}.`;
  }
  return base;
}

/** The arithmetic, shown rather than asserted — the shipped reports only ever
 *  assert the score, which is what made it necessary to reverse-engineer. */
function workedArithmetic(score: ScoreResult): string {
  const parts = [`100`];
  if (score.majorDeduction > 0) parts.push(`− ${score.majorDeduction} (Major)`);
  if (score.minorDeduction > 0) parts.push(`− ${score.minorDeduction} (Minor, 0.5 each)`);
  return `${parts.join(' ')} = ${score.indicativeScore}. `
    + 'Critical findings and Observations carry no score weight: a Critical '
    + 'overrides the outcome rather than reducing the score.';
}

function findingsIntro(cards: boolean): string {
  return 'Each finding identifies the protocol reference, the observed gap, the '
    + 'underlying risk, and the supporting evidence basis. Findings are ordered by '
    + 'severity. Critical '
    + (cards ? 'and Major findings are presented as full detail cards; Minor and Observation'
             : 'findings are presented as full detail cards; Major, Minor and Observation')
    + ' findings are presented in structured tables.';
}

function toCapaRow(f: Finding): CapaRow {
  return {
    ref: f.ref,
    severity: { C: 'Critical', M: 'Major', Mi: 'Minor', O: 'Observation' }[f.severity],
    nonConformity: f.requiredClosure,
    owner: f.ownerDept,
    deadlineDays: f.deadlineDays,
    dueDate: f.dueDate,
    rootCause: '',
    evidence: '',
  };
}

function decisionBanner(score: ScoreResult, protocol: Protocol): string {
  if (score.counts.critical > 0) {
    return `Final Decision — REJECTED — Listing Blocked. Per Protocol ${protocol.code}: `
      + 'any Critical finding triggers immediate failure. Re-assessment must be a full audit.';
  }
  if (score.outcome === 'REJECTED') {
    return `Final Decision — REJECTED — Listing Blocked. Score ${score.indicativeScore}/100 `
      + `falls below the ${PROVISIONAL_THRESHOLD}/100 required for conditional approval.`;
  }
  if (score.outcome === 'PROVISIONAL') {
    return `Final Decision — PROVISIONAL — Conditional Approval. Score ${score.indicativeScore}/100. `
      + 'Listing permitted subject to closure of all Major findings within 90 days.';
  }
  return `Final Decision — APPROVED — Listing Cleared. Score ${score.indicativeScore}/100, `
    + 'zero Critical findings and Majors within the permitted maximum.';
}

function milestones(supplier: string, findings: Finding[]): { day: string; owner: string; action: string }[] {
  const criticals = findings.filter((f) => f.severity === 'C');
  const majors = findings.filter((f) => f.severity === 'M');
  const minors = findings.filter((f) => f.severity === 'Mi');
  const rows = [
    { day: 'Day 0', owner: 'Afrizonemart QA', action: `Report issued to ${supplier} and partners.` },
    { day: 'Day 7', owner: `${supplier} QA`, action: `Acknowledge receipt; nominate a CAPA owner; submit an action plan covering all ${findings.length} findings.` },
    { day: 'Day 30', owner: `${supplier} QA`, action: 'First fortnightly progress report submitted.' },
  ];
  if (criticals.length) {
    rows.push({ day: 'Day 45', owner: `${supplier} QA`, action: `All Critical CAPAs (${criticals.map((f) => f.ref).join(', ')}) evidenced and closed via desk review.` });
  }
  if (minors.length) {
    rows.push({ day: 'Day 60', owner: `${supplier} QA`, action: 'All Minor CAPAs closed and evidenced.' });
  }
  if (majors.length) {
    rows.push({ day: 'Day 90', owner: `${supplier} QA`, action: `All ${majors.length} Major CAPAs closed and evidenced. Final CAPA tracker submitted.` });
  }
  rows.push({ day: 'Day 90+', owner: 'Afrizonemart QA', action: 'Full on-site re-assessment scheduled. A pass triggers listing approval.' });
  return rows;
}

function conditions(score: ScoreResult, findings: Finding[]): string[] {
  const majors = score.counts.major;
  const mustClose = Math.max(0, majors - MAX_MAJORS_FOR_APPROVAL);
  const criticalRefs = findings.filter((f) => f.severity === 'C').map((f) => f.ref);

  return [
    `Zero (0) Critical findings on re-audit${criticalRefs.length ? ` — currently ${criticalRefs.join(', ')}.` : '.'}`,
    `No more than ${MAX_MAJORS_FOR_APPROVAL} Major findings on re-audit`
      + (mustClose > 0 ? ` — this requires closing at least ${mustClose} of the current ${majors}.` : '.'),
    `Final score of ≥ ${PROVISIONAL_THRESHOLD}/100 for Conditional Approval, or ≥ ${APPROVED_THRESHOLD}/100 for full Approval.`,
    'Physical verification on-site of every Critical closure.',
    'All Major and Minor CAPA closures evidenced through documentation review.',
  ];
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
