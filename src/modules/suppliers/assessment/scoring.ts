/**
 * Conformity assessment scoring — the arithmetic behind every diagnostic report.
 *
 * This is a PURE function on purpose: no I/O, no clock, no randomness. It is the
 * one piece of this system whose output a supplier may formally dispute, so it
 * has to be reproducible and testable against the reports AZM has already
 * published. `tests/assessment-scoring.test.ts` replays twelve real historical
 * assessments through it and asserts we land on the numbers the human auditors
 * signed.
 *
 * The methodology is not stated as arithmetic anywhere in the source documents —
 * every report asserts a score without showing its working. It was recovered by
 * solving the published score/count pairs simultaneously, and it holds across
 * all twelve:
 *
 *     score = 100 − Σ(major points) − (0.5 × minor count)
 *
 * Three properties of that formula are worth stating explicitly, because each
 * one surprises people:
 *
 * 1. CRITICALS DEDUCT NOTHING. They do not lower the score — they override the
 *    outcome. Eden Foods scored 91/100 and was rejected outright on two
 *    Criticals. Modelling a Critical as a large deduction would be wrong: it
 *    would let a strong facility "absorb" one, which is precisely what the
 *    protocol forbids.
 * 2. THE BASE IS ALWAYS 100, regardless of how many checkpoints are N/A. ZAO had
 *    fourteen of thirty-six checkpoints rated N/A and was still scored out of
 *    100, not out of twenty-two. Normalising to the applicable subset would
 *    silently deflate every narrow product line.
 * 3. THE SCORE KEEPS HALVES. ZAO's published score is 94.5. Rounding to an
 *    integer cannot reproduce the shipped reports.
 */

export type Rating = 'C' | 'M' | 'Mi' | 'O' | 'Cpt' | 'NA';

/** Points a single Major finding deducts. The protocol gives the auditor a
 *  1–3 band; published reports average ~2, and 2 is the documented "mid-range". */
export const MAJOR_POINTS_MIN = 1;
export const MAJOR_POINTS_MAX = 3;
export const MAJOR_POINTS_DEFAULT = 2;

/** Deduction per Minor finding — fixed by the protocol, not auditor-variable. */
export const MINOR_POINTS = 0.5;

/** Outcome gates, quoted from §9b of every shipped report:
 *  "Zero (0) Critical findings on re-audit." and
 *  "No more than three (3) Major findings on re-audit." */
export const MAX_MAJORS_FOR_APPROVAL = 3;
export const APPROVED_THRESHOLD = 85;
export const PROVISIONAL_THRESHOLD = 70;

export type Outcome = 'APPROVED' | 'PROVISIONAL' | 'REJECTED';

export interface AssessmentResponse {
  rating?: Rating;
  /** Auditor's severity choice within the Major band. Clamped to 1–3; ignored
   *  for every other rating. */
  majorPoints?: number;
  /** Red Flag protocol (§10): a *confirmed* exceedance or contamination event —
   *  aflatoxin or HCN over limit, mould with no quarantine, unsafe water — is
   *  always Critical, whatever band the checkpoint normally sits in. This is
   *  distinct from "the control is absent", which follows the normal rating. */
  confirmedFinding?: boolean;
}

export type ResponseMap = Record<string, AssessmentResponse>;

export interface AuditCounts {
  critical: number;
  major: number;
  minor: number;
  observation: number;
  compliant: number;
  na: number;
}

export interface ScoreResult {
  counts: AuditCounts;
  /** Carries halves — do not round. */
  indicativeScore: number;
  outcome: Outcome;
  /** Broken out so the report can show its working to the supplier. */
  majorDeduction: number;
  minorDeduction: number;
  /** Checkpoint keys escalated to Critical by the Red Flag protocol, so the
   *  report can say why a checkpoint outranked its normal band. */
  escalatedToCritical: string[];
}

/** Clamp an auditor's Major severity into the protocol's 1–3 band. */
export function normaliseMajorPoints(points: number | undefined): number {
  if (typeof points !== 'number' || !Number.isFinite(points)) return MAJOR_POINTS_DEFAULT;
  return Math.min(MAJOR_POINTS_MAX, Math.max(MAJOR_POINTS_MIN, points));
}

/**
 * The effective rating for a response, after the Red Flag protocol.
 * Exported because the report generator needs the same answer the scorer used —
 * a finding escalated to Critical must appear under §4.1, not under its
 * original severity.
 */
export function effectiveRating(r: AssessmentResponse): Rating | undefined {
  if (!r.rating) return undefined;
  // Escalation only applies to actual findings. A checkpoint rated Compliant or
  // N/A cannot carry a confirmed contamination event; if it somehow does, that
  // is a data-entry error and we must not silently turn a pass into a failure.
  if (r.confirmedFinding && (r.rating === 'M' || r.rating === 'Mi' || r.rating === 'O')) {
    return 'C';
  }
  return r.rating;
}

export function scoreAssessment(responses: ResponseMap): ScoreResult {
  const counts: AuditCounts = {
    critical: 0, major: 0, minor: 0, observation: 0, compliant: 0, na: 0,
  };
  const escalatedToCritical: string[] = [];
  let majorDeduction = 0;

  for (const [key, response] of Object.entries(responses)) {
    const rating = effectiveRating(response);
    if (rating === 'C' && response.rating !== 'C') escalatedToCritical.push(key);

    switch (rating) {
      case 'C': counts.critical++; break;
      case 'M':
        counts.major++;
        majorDeduction += normaliseMajorPoints(response.majorPoints);
        break;
      case 'Mi': counts.minor++; break;
      case 'O': counts.observation++; break;
      case 'Cpt': counts.compliant++; break;
      case 'NA': counts.na++; break;
      default: break; // unrated — contributes nothing
    }
  }

  const minorDeduction = MINOR_POINTS * counts.minor;
  const indicativeScore = clampScore(100 - majorDeduction - minorDeduction);

  return {
    counts,
    indicativeScore,
    outcome: decideOutcome(indicativeScore, counts),
    majorDeduction,
    minorDeduction,
    escalatedToCritical,
  };
}

/**
 * Outcome gates. Order matters: the Critical override is absolute and is
 * evaluated before the score is even consulted.
 *
 * Note the Major cap applies to PROVISIONAL as well as APPROVED. The scoring
 * legend printed in every report says "no more than three permitted for any
 * approval outcome", and Conditional Approval is an approval outcome — a
 * facility with twelve Majors has not earned a provisional listing however its
 * arithmetic lands.
 */
export function decideOutcome(indicativeScore: number, counts: AuditCounts): Outcome {
  if (counts.critical > 0) return 'REJECTED';
  if (counts.major > MAX_MAJORS_FOR_APPROVAL) return 'REJECTED';
  if (indicativeScore >= APPROVED_THRESHOLD) return 'APPROVED';
  if (indicativeScore >= PROVISIONAL_THRESHOLD) return 'PROVISIONAL';
  return 'REJECTED';
}

/** CAPA windows, in days from report issue. Per severity, not a flat 90 —
 *  every shipped CAPA tracker uses exactly these. */
export const CAPA_DEADLINE_DAYS: Record<'C' | 'M' | 'Mi' | 'O', number> = {
  C: 45,
  Mi: 60,
  M: 90,
  O: 120,
};

function clampScore(n: number): number {
  const bounded = Math.min(100, Math.max(0, n));
  // Guard against float drift from repeated 0.5 additions (0.1+0.2 problem):
  // scores are always whole or half, so snapping to the nearest half is exact.
  return Math.round(bounded * 2) / 2;
}
