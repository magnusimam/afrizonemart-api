import { allowedRatings, type Checkpoint, type Protocol } from './catalogue';
import { evaluatePredicate } from './rules';
import { profileToFacts, type AssessmentProfile } from './profile';
import type { Rating } from './scoring';

/**
 * Checklist resolution — turning a product profile into the exact checklist an
 * auditor will carry into a facility.
 *
 * RESOLVE ONCE, SNAPSHOT, NEVER RECOMPUTE. This is the load-bearing decision in
 * the whole module. A resolved checklist is frozen onto the assessment together
 * with the catalogue version and the profile it was derived from. When a report
 * is challenged eight months later — and at ten thousand suppliers it will be —
 * we have to be able to show the checklist that was actually used, not what the
 * same inputs would produce against a catalogue that has since been edited.
 * Re-resolving on read would quietly answer a different question.
 *
 * The other deliberate choice: every included checkpoint carries the reason it
 * was included, in plain words. A supplier assessed on cyanide reduction is
 * entitled to read "because you declared cassava". An unexplained score is a
 * score people argue with, and arguing about scores does not scale.
 */

export interface ChecklistItem {
  ref: string;
  section: string;
  order: number;
  text: string;
  guidance?: string;
  evidence?: string[];

  /** Ratings the UI may offer, already narrowed by severity class. */
  allowedRatings: Rating[];
  defaultIfAbsent: Rating;
  majorPoints?: number;
  severityClass: Checkpoint['severityClass'];
  escalatesOnConfirmedFinding: boolean;

  /** Why this checkpoint is on the checklist. Printed in the report. */
  includedBecause: string;

  /** Carried through so report generation needs no second catalogue lookup. */
  defaultOwnerDept: string;
  defaultClosureText: string;
  standards?: string[];
  limits?: Checkpoint['limits'];
}

export interface ExcludedCheckpoint {
  ref: string;
  /** Why it was left off — retained so the report can state what was NOT
   *  assessed and why. ZAO's report does exactly this for its fourteen
   *  inapplicable checkpoints, and it is what makes a narrow scope defensible
   *  rather than looking like a gap. */
  excludedBecause: string;
}

export interface ResolvedChecklist {
  protocolCode: string;
  protocolName: string;
  protocolVersion: string;
  sections: Protocol['sections'];
  items: ChecklistItem[];
  excluded: ExcludedCheckpoint[];
  /** The facts this resolution was computed from — snapshotted, so a later
   *  profile edit cannot retroactively change a completed assessment. */
  facts: Record<string, unknown>;
  resolvedAt: string;
}

export function resolveChecklist(
  protocol: Protocol,
  profile: AssessmentProfile,
  now: Date = new Date(),
): ResolvedChecklist {
  const facts = profileToFacts(profile);
  const items: ChecklistItem[] = [];
  const excluded: ExcludedCheckpoint[] = [];

  for (const cp of protocol.checkpoints) {
    const verdict = evaluatePredicate(cp.appliesWhen, facts);

    if (!verdict.matched) {
      excluded.push({ ref: cp.ref, excludedBecause: verdict.reason });
      continue;
    }

    items.push({
      ref: cp.ref,
      section: cp.section,
      order: cp.order,
      text: cp.text,
      guidance: cp.guidance,
      evidence: cp.evidence,
      allowedRatings: allowedRatings(cp),
      defaultIfAbsent: cp.defaultIfAbsent,
      majorPoints: cp.majorPoints,
      severityClass: cp.severityClass,
      escalatesOnConfirmedFinding: cp.escalatesOnConfirmedFinding ?? false,
      includedBecause: verdict.reason,
      defaultOwnerDept: cp.defaultOwnerDept,
      defaultClosureText: cp.defaultClosureText,
      standards: cp.standards,
      limits: cp.limits,
    });
  }

  items.sort(bySectionThenOrder);

  return {
    protocolCode: protocol.code,
    protocolName: protocol.name,
    protocolVersion: protocol.version,
    sections: protocol.sections,
    items,
    excluded,
    facts,
    resolvedAt: now.toISOString(),
  };
}

function bySectionThenOrder(a: ChecklistItem, b: ChecklistItem): number {
  return a.section === b.section ? a.order - b.order : a.section.localeCompare(b.section);
}

/**
 * Guard for completion. The existing `completeAudit` demands a rating for every
 * checkpoint in the whole category template, which is precisely what breaks once
 * checklists are customised — a supplier with fourteen inapplicable checkpoints
 * could never be completed. Completion must be judged against the RESOLVED
 * checklist that was actually issued.
 */
export interface CompletenessResult {
  complete: boolean;
  missing: string[];
  /** Ratings above the checkpoint's documented default with no justification
   *  written. Blocking these is what keeps severity comparable between
   *  auditors once a field team replaces a couple of experts. */
  unjustified: string[];
}

export function checkCompleteness(
  checklist: ResolvedChecklist,
  responses: Record<string, { rating?: Rating; justification?: string }>,
): CompletenessResult {
  const missing: string[] = [];
  const unjustified: string[] = [];

  for (const item of checklist.items) {
    const response = responses[item.ref];
    if (!response?.rating) {
      missing.push(item.ref);
      continue;
    }
    if (exceedsDefault(item, response.rating) && !response.justification?.trim()) {
      unjustified.push(item.ref);
    }
  }

  return { complete: missing.length === 0 && unjustified.length === 0, missing, unjustified };
}

const SEVERITY_ORDER: Rating[] = ['C', 'M', 'Mi', 'O', 'Cpt', 'NA'];

function exceedsDefault(item: ChecklistItem, rating: Rating): boolean {
  if (rating === 'Cpt' || rating === 'NA') return false;
  // A fixed Critical has no discretion to exercise, so nothing to justify.
  if (item.severityClass === 'FIXED_CRITICAL') return false;
  return SEVERITY_ORDER.indexOf(rating) < SEVERITY_ORDER.indexOf(item.defaultIfAbsent);
}
