/**
 * The checkpoint catalogue — what an auditor can be asked to inspect.
 *
 * DESIGN COMMITMENT: this is data, not code. There are already nine category
 * checklists and there will be many more, and the people who own them are the
 * standards team, not engineers. A catalogue expressed as TypeScript branching
 * would put a deploy between "we added a checkpoint" and "auditors see it",
 * which does not survive the growth this is being built for.
 *
 * The shipped protocols are seeded from these definitions and then live in the
 * database, versioned. Publishing a new version never edits an old one, because
 * completed assessments must keep resolving against the catalogue that was in
 * force when they were carried out.
 */

import type { Predicate } from './rules';
import type { Rating } from './scoring';

/**
 * How a checkpoint's severity is decided. This is the single most important
 * field on a checkpoint: it determines what the auditor's UI will even offer
 * them, and it is drawn straight from the protocol's own closing analysis, which
 * identifies exactly these three behaviours.
 */
export type SeverityClass =
  /**
   * Critical regardless of product, and not the auditor's call. The protocol
   * names three: NAFDAC registration, metal detection, written recall
   * procedure. "Every flour business fails instantly without them."
   * UI offers Compliant or Critical. Nothing else.
   */
  | 'FIXED_CRITICAL'
  /**
   * Applies only when the product triggers it. When it doesn't apply the
   * checkpoint is left off the checklist entirely rather than shown as N/A —
   * a cassava checkpoint on a honey audit is noise that trains auditors to
   * skim.
   */
  | 'CONDITIONAL'
  /**
   * The auditor's judgement. The same missing control is Minor, Major or
   * Observation depending on whether it is a paperwork gap, a real physical
   * exposure, or a confirmed event. UI constrains to `allowedRange`, and
   * exceeding `defaultIfAbsent` requires a written justification.
   */
  | 'BY_DEGREE';

export type EvidenceKind =
  | 'certificate' | 'photo' | 'log' | 'coa' | 'measurement' | 'sop' | 'record';

/** A numeric limit an auditor may need to check a measurement against. */
export interface LimitSpec {
  parameter: string;      // 'Aflatoxin B1'
  max?: number;
  min?: number;
  unit: string;           // 'ppb'
  standard?: string;      // 'NAFDAC / Codex'
  appliesWhen?: Predicate;
}

export interface Checkpoint {
  /** Stable, human-quotable, printed in the report and used as the join key
   *  across six report sections. Never renumber a published ref. */
  ref: string;
  section: string;          // 'A'
  order: number;

  /** The requirement, verbatim from the protocol. */
  text: string;
  /** What "good" looks like — shown inline to the auditor. */
  guidance?: string;
  evidence?: EvidenceKind[];

  severityClass: SeverityClass;
  /** The rating this checkpoint carries when the control is absent. */
  defaultIfAbsent: Rating;
  /** BY_DEGREE only — the ratings the UI will offer. */
  allowedRange?: Rating[];
  /** Default points deducted when rated Major (protocol band is 1–3). */
  majorPoints?: 1 | 2 | 3;

  /** CONDITIONAL only. Absent means the checkpoint always applies. */
  appliesWhen?: Predicate;
  /**
   * Red Flag protocol: a *confirmed* exceedance or contamination event forces
   * Critical whatever the normal band. Distinct from "the control is absent".
   */
  escalatesOnConfirmedFinding?: boolean;

  /** Report-generation libraries, keyed by ref. Each is a pure lookup that
   *  removes authoring work from §4, §6, §7 and §8 of the report. */
  defaultOwnerDept: string;
  defaultClosureText: string;

  standards?: string[];
  limits?: LimitSpec[];
}

export interface ProtocolSection {
  letter: string;
  title: string;
}

export interface Protocol {
  /** e.g. 'AFZ-QA-FPS-001'. Printed on the report and part of its document code. */
  code: string;
  name: string;
  version: string;
  /** Product classes this protocol covers — used to route a supplier to it. */
  productClasses: string[];
  sections: ProtocolSection[];
  checkpoints: Checkpoint[];
  /**
   * The "Section 8 non-negotiables", cited by number throughout every shipped
   * report ("Section 8 non-negotiable #2") but never listed in full in any
   * document we hold. Numbering is per-protocol — #7 means metal detection
   * under FPS and traceability-to-source under EOB — so it cannot be global.
   */
  nonNegotiables: { number: number; description: string; checkpointRef?: string }[];
  /** Documents requested before the visit; drives §2 and §6 of the report. */
  preVisitDocs: string[];
  /**
   * Per-protocol outcome wording, where the protocol states its own. Template F
   * gives Major CAPA a 14-day desk-verification window against the 90 days the
   * FPS reports use — so outcome rules cannot be assumed global. Captured as
   * text pending a decision on which governs.
   */
  outcomeRules?: string[];
  /** Product classes the protocol declares itself to cover, in its own words. */
  scopeNotes?: string[];
}

/** The three refs the protocol fixes as Critical for every product. */
export const UNIVERSAL_CRITICAL_REFS = ['A.2', 'B.4', 'J.2'] as const;

/**
 * Ratings the UI should offer for a checkpoint. Encodes the rule that a fixed
 * Critical cannot be talked down and a by-degree checkpoint cannot be inflated
 * past its band — the two ways severity drifts once a field team replaces a
 * couple of experts.
 */
export function allowedRatings(cp: Checkpoint): Rating[] {
  if (cp.severityClass === 'FIXED_CRITICAL') return ['Cpt', 'C'];
  const range = cp.allowedRange ?? [cp.defaultIfAbsent];
  // Compliant is always available; N/A only where the checkpoint is conditional.
  const base: Rating[] = ['Cpt', ...range];
  if (cp.severityClass === 'CONDITIONAL') base.push('NA');
  return [...new Set(base)];
}

/** Severity ordering, worst first — used to sort findings in the report. */
const SEVERITY_ORDER: Rating[] = ['C', 'M', 'Mi', 'O', 'Cpt', 'NA'];
export function severityRank(r: Rating): number {
  const i = SEVERITY_ORDER.indexOf(r);
  return i === -1 ? SEVERITY_ORDER.length : i;
}

/**
 * Whether a rating exceeds the checkpoint's documented default, which is what
 * makes a written justification mandatory. Without this, "Major" quietly
 * becomes whatever each auditor feels it means, and scores stop being
 * comparable between facilities — the failure mode that matters most at scale.
 */
export function requiresJustification(cp: Checkpoint, rating: Rating): boolean {
  if (rating === 'Cpt' || rating === 'NA') return false;
  return severityRank(rating) < severityRank(cp.defaultIfAbsent);
}
