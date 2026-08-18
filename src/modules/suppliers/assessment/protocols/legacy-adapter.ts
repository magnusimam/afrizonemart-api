import { AUDIT_TEMPLATES } from '../../audit-templates';
import type { Checkpoint, Protocol } from '../catalogue';
import { CORE_CHECKPOINTS } from './core';

/**
 * Bridge from the legacy generated templates to the assessment catalogue.
 *
 * `audit-templates.ts` was scraped out of the category .docx files and holds
 * 215 checkpoints across six categories. It is the only machine-readable copy
 * of that text we have, so it is worth lifting — but its quality is uneven and
 * it must not be trusted wholesale:
 *
 *   • 106 of 215 checkpoints carry a clean `A.1`-style ref. The other 103 are
 *     bare numbers, having lost their section letter in extraction.
 *   • Category F contains 18 "checkpoints" that are actually prose blobs — a
 *     product-classification matrix, a document list and an outcome decision
 *     table — which are currently scored as if they were real checkpoints.
 *   • Categories B–F have empty preVisitDocs/standards.
 *
 * Above all, THE SOURCE DOCUMENTS DO NOT ENCODE SEVERITY. Every checkpoint on
 * every category checklist offers the same blank `C M Mi O Cpt` choice, with no
 * default and no constraint. Severity semantics exist only in the governing
 * Audit Protocol document, which is what `core.ts` encodes.
 *
 * So this adapter deliberately does NOT guess. It inherits severity only where
 * that inheritance is defensible, and reports everything else as work for the
 * standards team rather than silently inventing a default. A wrong default here
 * would be invisible: an auditor would simply see a plausible-looking form and
 * a supplier would be scored against a rule nobody chose.
 */

/**
 * ⚠️ NO legacy category may inherit severity by ref, including category A.
 *
 * That was the original assumption and it is wrong. Legacy category A is an
 * OLDER, SHORTER generation of the flours checklist — 31 checkpoints across
 * sections A–L, against the governing protocol's 40 across A–K. The first few
 * refs coincide (A.1 business registration, A.2 NAFDAC) which makes the
 * mismatch look like alignment, but the numbering diverges immediately after
 * and several controls are missing outright:
 *
 *   • B.4 metal detection / magnetic separation — a universal Critical — has no
 *     equivalent. Legacy B stops at B.3.
 *   • D.4 cyanide (HCN) reduction and F.3 HCN batch testing are absent, even
 *     though the Master Index routes cassava flour to this very template
 *     "requiring validation of cyanide reduction".
 *   • A.4 HACCP, A.5/F.5/H.4 fortification, D.5 gelatinisation and D.6
 *     fermentation monitoring are all absent.
 *   • Recall is L.1, bundled with complaint management, not the standalone
 *     drilled-recall Critical the protocol fixes as J.2.
 *
 * The shipped diagnostic reports cite B.4, D.4, F.3 and J.2 — refs that do not
 * exist here. The reports were written against the newer protocol while this
 * generated file still carries the older one.
 *
 * Inheriting by ref would therefore attach the governing document's severity to
 * whatever checkpoint happens to share a number, which is worse than no
 * severity at all: it would look authoritative and be wrong. Everything is
 * reported as unmapped instead, and the real protocols are built from the
 * current document set.
 */
const REF_ALIGNED_CATEGORIES = new Set<string>();

const CODES: Record<string, string> = {
  A: 'AFZ-QA-FPS-001',
  B: 'AFZ-QA-EOB-006',
  C: 'AFZ-QA-SNK-001',
  D: 'AFZ-QA-HPC-006',
  E: 'AFZ-QA-FFC-001',
  F: 'AFZ-QA-HRA-004',
};

/** Product classes routed to each category. Seeded from the Master Index. */
const PRODUCT_CLASSES: Record<string, string[]> = {
  A: ['flour-staple', 'swallow', 'cereal', 'powdered-staple', 'baby-cereal'],
  B: ['edible-oil', 'botanical', 'infusion', 'tea'],
  C: ['snack', 'nut', 'ready-to-eat-dry'],
  D: ['cosmetic', 'personal-care', 'topical-wellness', 'black-soap'],
  E: ['apparel', 'footwear', 'crafted-lifestyle'],
  F: ['fish', 'meat', 'egg', 'honey', 'high-risk-animal'],
};

const CORE_BY_REF = new Map(CORE_CHECKPOINTS.map((c) => [c.ref, c]));

const REF_PATTERN = /^[A-L]\.\d+$/;

export interface AdapterIssue {
  category: string;
  ref: string;
  requirement: string;
  kind:
    | 'no-section-ref'        // label lost its section letter in extraction
    | 'no-severity-mapping'   // no core checkpoint to inherit from
    | 'recovered-metadata';   // not a checkpoint — recovered to its proper home
}

export interface AdaptedProtocols {
  protocols: Protocol[];
  /** The precise worklist for the standards team. */
  issues: AdapterIssue[];
}

/**
 * A section whose every row has no evidence requirement is not a list of
 * checkpoints at all — it is a table the scraper flattened into the checkpoint
 * shape. Template F has three: a product-classification matrix, the pre-visit
 * document list, and the outcome decision table.
 *
 * Those 18 rows are currently SCORED as if they were controls, and
 * `completeAudit` demands a rating for each. That is where template F's
 * implausible 77 checkpoints come from. They are not junk though — two of the
 * three are real governance data filed in the wrong place, so they are
 * recovered below rather than dropped.
 */
function isMetadataSection(section: { checkpoints: { evidence: string }[] }): boolean {
  return section.checkpoints.length > 0
    && section.checkpoints.every((c) => !c.evidence.trim());
}

/**
 * The rule above only discriminates where the template populates evidence at
 * all. Templates B, C and E have no evidence text on ANY row, so an empty
 * evidence field there means "the scraper didn't capture it", not "this isn't a
 * checkpoint" — applying the heuristic blindly deletes those protocols
 * entirely. Only trust the signal where the template demonstrably uses it.
 */
function templateUsesEvidence(template: { sections: { checkpoints: { evidence: string }[] }[] }): boolean {
  return template.sections.some((s) => s.checkpoints.some((c) => c.evidence.trim()));
}

type MetadataKind = 'pre-visit-docs' | 'outcome-rules' | 'scope-notes';

/** Classify a metadata section by what its title is doing. */
function classifyMetadata(title: string): MetadataKind {
  const t = title.toLowerCase();
  if (t.includes('document') && t.includes('request')) return 'pre-visit-docs';
  if (t.includes('outcome') || t.includes('determine the correct')) return 'outcome-rules';
  return 'scope-notes';
}

export function adaptLegacyTemplates(): AdaptedProtocols {
  const protocols: Protocol[] = [];
  const issues: AdapterIssue[] = [];

  for (const [category, template] of Object.entries(AUDIT_TEMPLATES)) {
    const checkpoints: Checkpoint[] = [];
    const canInherit = REF_ALIGNED_CATEGORIES.has(category);
    const recoveredDocs: string[] = [];
    const outcomeRules: string[] = [];
    const scopeNotes: string[] = [];
    const checkpointSections: Protocol['sections'] = [];
    const evidenceIsMeaningful = templateUsesEvidence(template);

    template.sections.forEach((section) => {
      // Recover the flattened tables to their proper homes before they can be
      // mistaken for controls.
      if (evidenceIsMeaningful && isMetadataSection(section)) {
        const rows = section.checkpoints.map((c) => c.requirement.trim()).filter(Boolean);
        const target = { 'pre-visit-docs': recoveredDocs, 'outcome-rules': outcomeRules, 'scope-notes': scopeNotes }[
          classifyMetadata(section.title)
        ];
        target.push(...rows);
        for (const cp of section.checkpoints) {
          issues.push({
            category, ref: cp.label, requirement: cp.requirement, kind: 'recovered-metadata',
          });
        }
        return;
      }

      const sectionLetter = String.fromCharCode(65 + checkpointSections.length);
      checkpointSections.push({ letter: sectionLetter, title: section.title });

      section.checkpoints.forEach((cp, order) => {
        const hasRef = REF_PATTERN.test(cp.label);
        const ref = hasRef ? cp.label : `${sectionLetter}.${order + 1}`;

        if (!hasRef) {
          issues.push({
            category, ref, requirement: cp.requirement, kind: 'no-section-ref',
          });
        }

        const inherited = canInherit ? CORE_BY_REF.get(ref) : undefined;

        if (!inherited) {
          issues.push({
            category, ref, requirement: cp.requirement, kind: 'no-severity-mapping',
          });
        }

        checkpoints.push({
          ref,
          section: ref.split('.')[0],
          order: order + 1,
          text: cp.requirement,
          evidence: cp.evidence ? ['record'] : undefined,
          guidance: cp.evidence || undefined,

          // Inherit the governing document's severity model where the refs
          // genuinely correspond; otherwise fall back to the protocol's most
          // common shape (a judgement call bounded at Minor–Major) and flag it.
          severityClass: inherited?.severityClass ?? 'BY_DEGREE',
          defaultIfAbsent: inherited?.defaultIfAbsent ?? 'Mi',
          allowedRange: inherited?.allowedRange ?? ['Mi', 'M'],
          majorPoints: inherited?.majorPoints,
          appliesWhen: inherited?.appliesWhen,
          escalatesOnConfirmedFinding: inherited?.escalatesOnConfirmedFinding,

          defaultOwnerDept: inherited?.defaultOwnerDept ?? 'QA',
          defaultClosureText: inherited?.defaultClosureText ?? `Address: ${cp.requirement}`,
          standards: inherited?.standards,
          limits: inherited?.limits,
        });
      });
    });

    protocols.push({
      code: CODES[category] ?? `AFZ-QA-${category}`,
      name: template.name,
      version: '0.1-legacy',
      productClasses: PRODUCT_CLASSES[category] ?? [],
      sections: checkpointSections,
      checkpoints,
      nonNegotiables: [],
      // Categories B–F have an empty preVisitDocs in the generated file, which
      // is why their visit forms render almost nothing. Where the document list
      // was flattened into a fake section we can put it back.
      preVisitDocs: template.preVisitDocs?.length ? template.preVisitDocs : recoveredDocs,
      outcomeRules,
      scopeNotes,
    });
  }

  return { protocols, issues };
}

export interface CoverageGap {
  ref: string;
  text: string;
  severityClass: Checkpoint['severityClass'];
  /** True where the missing control is one the protocol fixes as Critical for
   *  every product — the gaps that make a template unable to fail a supplier
   *  for the very things that rejected real ones. */
  universalCritical: boolean;
}

/**
 * Which governed controls a protocol cannot assess.
 *
 * This exists so the staleness of a template is a test failure rather than a
 * discovery someone makes eight months in. A template missing B.4 does not
 * error, does not warn, and produces a perfectly plausible-looking audit — it
 * simply never asks whether the supplier has a metal detector, and nobody finds
 * out until a report cites a checkpoint the form never contained.
 */
export function coverageGapsAgainstCore(protocol: Protocol): CoverageGap[] {
  const present = new Set(protocol.checkpoints.map((c) => c.ref));
  return CORE_CHECKPOINTS
    .filter((c) => !present.has(c.ref))
    .map((c) => ({
      ref: c.ref,
      text: c.text,
      severityClass: c.severityClass,
      universalCritical: c.severityClass === 'FIXED_CRITICAL',
    }));
}

/**
 * Route a product class to its protocol.
 *
 * The legacy `getAuditTemplate()` takes an unvalidated free-text category and
 * silently returns null when it doesn't match — which is why both the visit form
 * and the audit currently receive nothing for most suppliers. This returns
 * undefined explicitly so callers must handle the miss.
 */
export function protocolForProductClass(
  productClass: string,
  protocols: Protocol[],
): Protocol | undefined {
  return protocols.find((p) => p.productClasses.includes(productClass));
}
