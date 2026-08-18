import type { ChecklistItem, ResolvedChecklist } from './resolver';
import {
  CAPA_DEADLINE_DAYS,
  effectiveRating,
  normaliseMajorPoints,
  type AssessmentResponse,
  type Rating,
} from './scoring';

/**
 * Findings — the join between what the auditor recorded and what the report
 * prints.
 *
 * The checkpoint ref is the key that makes the report generatable at all. One
 * finding record populates SIX sections of the diagnostic report: the §3
 * conformity dashboard, its §4 card or table row, the §6 documentation gap
 * register, the §7 remediation roadmap, the §8 CAPA tracker and the §9
 * re-assessment milestones. Getting the finding right once is what removes the
 * authoring work from all six.
 *
 * Everything here is derived. Nothing in this file requires a human to write a
 * sentence — that is confined to the executive summary and the decision
 * paragraph, which are the only genuinely authored parts of the document.
 */

export type Severity = 'C' | 'M' | 'Mi' | 'O';

export interface Finding {
  ref: string;
  section: string;
  severity: Severity;
  /** The checkpoint requirement — the report's finding title. */
  title: string;
  /** The auditor's free-text note. Shipped reports quote this verbatim inside
   *  "Evidence Basis", so it is report content, not an internal comment. */
  auditorNote: string;
  /** 2–6 word gloss for the dashboard ("Not logged per batch"). */
  statusNote: string;
  /** Why the auditor rated above the checkpoint default, where they did. */
  justification: string;
  /** Set when the Red Flag protocol forced this to Critical. */
  escalated: boolean;
  /** Points deducted — Majors only. */
  points: number;
  /** What closes it. Reused verbatim in §4 tables and §8 CAPA. */
  requiredClosure: string;
  ownerDept: string;
  deadlineDays: number;
  dueDate: string;
  standards: string[];
}

export interface DashboardRow {
  ref: string;
  section: string;
  text: string;
  rating: Rating | 'NOT_ASSESSED';
  statusNote: string;
  /** Present on excluded rows: why this checkpoint did not apply. */
  notApplicableBecause?: string;
}

const RATING_LABEL: Record<Rating | 'NOT_ASSESSED', string> = {
  C: 'CRITICAL',
  M: 'MAJOR',
  Mi: 'MINOR',
  O: 'OBSERVATION',
  Cpt: 'COMPLIANT',
  NA: 'NOT APPLIC.',
  NOT_ASSESSED: 'NOT RATED',
};

export function ratingLabel(r: Rating | 'NOT_ASSESSED'): string {
  return RATING_LABEL[r];
}

const SEVERITY_ORDER: Severity[] = ['C', 'M', 'Mi', 'O'];

export interface DeriveOptions {
  /** Report issue date — CAPA clocks run from here, not from the visit. */
  issuedAt: Date;
}

/**
 * Derive the findings from a completed checklist.
 *
 * Compliant and not-applicable checkpoints are not findings; they appear in the
 * §3 dashboard and feed §5 Compliance Strengths, but they carry no action.
 */
export function deriveFindings(
  checklist: ResolvedChecklist,
  responses: Record<string, AssessmentResponse & { justification?: string; statusNote?: string; findings?: string }>,
  { issuedAt }: DeriveOptions,
): Finding[] {
  const findings: Finding[] = [];

  for (const item of checklist.items) {
    const response = responses[item.ref];
    if (!response?.rating) continue;

    const rating = effectiveRating(response);
    if (!rating || rating === 'Cpt' || rating === 'NA') continue;

    const severity = rating as Severity;
    const deadlineDays = CAPA_DEADLINE_DAYS[severity];

    findings.push({
      ref: item.ref,
      section: item.section,
      severity,
      title: item.text,
      auditorNote: response.findings?.trim() ?? '',
      statusNote: response.statusNote?.trim() ?? defaultStatusNote(severity),
      justification: response.justification?.trim() ?? '',
      escalated: rating === 'C' && response.rating !== 'C',
      points: severity === 'M' ? normaliseMajorPoints(response.majorPoints) : 0,
      requiredClosure: item.defaultClosureText,
      ownerDept: item.defaultOwnerDept,
      deadlineDays,
      dueDate: addDays(issuedAt, deadlineDays),
      standards: item.standards ?? [],
    });
  }

  return findings.sort(bySeverityThenRef);
}

/**
 * The §3 conformity matrix — every checkpoint, assessed or not.
 *
 * Excluded checkpoints are listed with the reason they did not apply rather
 * than omitted. ZAO's report does exactly this for its fourteen inapplicable
 * items, and it is what makes a narrow product scope read as deliberate rather
 * than as something the auditor skipped.
 */
export function buildDashboard(
  checklist: ResolvedChecklist,
  responses: Record<string, AssessmentResponse & { statusNote?: string }>,
): DashboardRow[] {
  const rows: DashboardRow[] = checklist.items.map((item) => {
    const response = responses[item.ref];
    const rating = response?.rating ? (effectiveRating(response) ?? 'NOT_ASSESSED') : 'NOT_ASSESSED';
    return {
      ref: item.ref,
      section: item.section,
      text: item.text,
      rating,
      statusNote: response?.statusNote?.trim()
        ?? (rating === 'Cpt' ? 'Verified on-site' : ''),
    };
  });

  const excludedRefs = new Map(checklist.excluded.map((e) => [e.ref, e.excludedBecause]));
  for (const [ref, reason] of excludedRefs) {
    rows.push({
      ref, section: ref.split('.')[0], text: '',
      rating: 'NA', statusNote: 'Not applicable',
      notApplicableBecause: reason,
    });
  }

  return rows.sort((a, b) => (a.section === b.section
    ? refNumber(a.ref) - refNumber(b.ref)
    : a.section.localeCompare(b.section)));
}

/** Checkpoints rated Compliant, for §5 Compliance Strengths. */
export function complianceStrengths(
  checklist: ResolvedChecklist,
  responses: Record<string, AssessmentResponse>,
): { ref: string; section: string; text: string }[] {
  return checklist.items
    .filter((i) => effectiveRating(responses[i.ref] ?? {}) === 'Cpt')
    .map((i) => ({ ref: i.ref, section: i.section, text: i.text }));
}

/**
 * §4 presentation mode. Criticals always get full detail cards; Majors get
 * cards when there are few and a grouped table when there are many. The shipped
 * reports switch at around four — Eden (4) and ZAO (2) used cards, Ritzy (6)
 * and USEDIAMEG (12) used tables — and the §4 intro sentence changes to match.
 */
export const MAJOR_CARD_LIMIT = 4;

export function majorsAsCards(findings: Finding[]): boolean {
  return findings.filter((f) => f.severity === 'M').length <= MAJOR_CARD_LIMIT;
}

/**
 * §7 remediation roadmap phases, which mirror the CAPA windows exactly:
 * Phase 1 closes Criticals (0–45), Phase 2 the Majors (0–90), Phase 3 the rest.
 */
export interface RoadmapPhase {
  phase: 1 | 2 | 3;
  label: string;
  windowDays: number;
  findings: Finding[];
}

export function buildRoadmap(findings: Finding[]): RoadmapPhase[] {
  const phase = (n: 1 | 2 | 3, label: string, days: number, sevs: Severity[]): RoadmapPhase => ({
    phase: n, label, windowDays: days,
    findings: findings.filter((f) => sevs.includes(f.severity)),
  });
  return [
    phase(1, 'Phase 1 — Days 0–45', 45, ['C']),
    phase(2, 'Phase 2 — Days 0–90', 90, ['M', 'Mi']),
    phase(3, 'Phase 3 — Days 0–120', 120, ['O']),
  ].filter((p) => p.findings.length > 0);
}

function defaultStatusNote(severity: Severity): string {
  return { C: 'Absent — Non-Negotiable', M: 'Not demonstrated', Mi: 'Partial — incomplete', O: 'Advisory' }[severity];
}

function bySeverityThenRef(a: Finding, b: Finding): number {
  const bySeverity = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
  if (bySeverity !== 0) return bySeverity;
  return a.section === b.section ? refNumber(a.ref) - refNumber(b.ref) : a.section.localeCompare(b.section);
}

function refNumber(ref: string): number {
  return Number(ref.split('.')[1] ?? 0);
}

/** ISO date N days after `from`. Dates only — CAPA deadlines are days, not
 *  timestamps, and a time component would imply a precision nobody honours. */
function addDays(from: Date, days: number): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export { addDays as capaDueDate };
