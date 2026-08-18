import type { Checkpoint, Protocol } from '../catalogue';
import { CORE_CHECKPOINTS, CORE_NON_NEGOTIABLES } from './core';
import { GENERATED_PROTOCOLS, type GeneratedProtocol } from './generated';

/**
 * The live protocol catalogue, built from the current AZM category checklists.
 *
 * Replaces `audit-templates.ts`, which was generated from an older document
 * generation and cannot assess metal detection, cassava cyanide control, HACCP
 * or fortification — see SUPPLIER_ASSESSMENT_AUTOMATION.md §9a.
 *
 * SEVERITY. The source checklists do not carry it: every checkpoint offers the
 * same blank `C M Mi O Cpt` choice, with no default and no constraint. The
 * severity model lives in `core.ts`, transcribed from the governing Audit
 * Protocol document.
 *
 * The flours protocol inherits it wholesale, because the two are structurally
 * identical — 43 checkpoints, sections A–K, per-section counts matching exactly
 * (A:5 B:4 C:4 D:6 E:4 F:5 G:3 H:4 I:3 J:3 K:2). The governing document simply
 * IS the flours protocol.
 *
 * Nothing else inherits, and that restraint is deliberate. Refs are independent
 * between protocols — honey's section C is moisture control, black soap's is
 * heavy metals, fashion's section E is restricted substances with no food
 * analogue. Matching on ref number would attach a severity to an unrelated
 * control and look authoritative doing it. Those checkpoints are typed
 * `BY_DEGREE` within a bounded Minor–Major range and listed by
 * `checkpointsAwaitingSeverity()` until the standards team assigns them.
 */

const CORE_BY_REF = new Map(CORE_CHECKPOINTS.map((c) => [c.ref, c]));

/** Fallback for a checkpoint whose severity has not yet been assigned.
 *  Never Critical: an unreviewed guess must not be able to fail a supplier. */
const UNASSIGNED: Pick<
  Checkpoint,
  'severityClass' | 'defaultIfAbsent' | 'allowedRange' | 'defaultOwnerDept'
> = {
  severityClass: 'BY_DEGREE',
  defaultIfAbsent: 'Mi',
  allowedRange: ['Mi', 'M'],
  defaultOwnerDept: 'QA',
};

function toCheckpoint(gen: GeneratedProtocol['checkpoints'][number], inherit: boolean): Checkpoint {
  const core = inherit ? CORE_BY_REF.get(gen.ref) : undefined;

  return {
    ref: gen.ref,
    section: gen.section,
    order: gen.order,
    // Prefer the current document's wording — it is the text auditors will read
    // in the field, and it is more specific than the governing document's
    // shorthand ("Metal detection or magnetic separation in place after milling
    // and before packaging" against "Metal detection / magnetic separation").
    text: gen.text || core?.text || '',
    guidance: gen.evidenceNote || core?.guidance,
    evidence: core?.evidence,

    severityClass: core?.severityClass ?? UNASSIGNED.severityClass,
    defaultIfAbsent: core?.defaultIfAbsent ?? UNASSIGNED.defaultIfAbsent,
    allowedRange: core?.allowedRange ?? UNASSIGNED.allowedRange,
    majorPoints: core?.majorPoints,
    appliesWhen: core?.appliesWhen,
    escalatesOnConfirmedFinding: core?.escalatesOnConfirmedFinding,

    defaultOwnerDept: core?.defaultOwnerDept ?? UNASSIGNED.defaultOwnerDept,
    defaultClosureText: core?.defaultClosureText ?? `Address: ${gen.text}`,
    standards: core?.standards,
    limits: core?.limits,
  };
}

function toProtocol(gen: GeneratedProtocol): Protocol {
  return {
    code: gen.code,
    name: gen.name,
    version: gen.version,
    productClasses: gen.productClasses,
    sections: gen.sections,
    checkpoints: gen.checkpoints.map((c) => toCheckpoint(c, gen.inheritsCoreSeverity)),
    // Non-negotiables are numbered per protocol (#7 is metal detection under
    // flours but traceability-to-source under edible oils), so they cannot be
    // shared. Only flours has a transcribed list.
    nonNegotiables: gen.inheritsCoreSeverity ? CORE_NON_NEGOTIABLES : [],
    preVisitDocs: [],
  };
}

export const PROTOCOLS: Protocol[] = GENERATED_PROTOCOLS.map(toProtocol);

const BY_CODE = new Map(PROTOCOLS.map((p) => [p.code, p]));
const BY_PRODUCT_CLASS = new Map<string, Protocol>();
for (const p of PROTOCOLS) {
  for (const pc of p.productClasses) BY_PRODUCT_CLASS.set(pc, p);
}

export function getProtocol(code: string): Protocol | undefined {
  return BY_CODE.get(code);
}

/**
 * Route a product class to its protocol.
 *
 * Returns undefined rather than null-and-carry-on. The legacy
 * `getAuditTemplate()` took unvalidated free text and silently returned null,
 * which is why the visit form and audit currently render nothing for most
 * suppliers — a miss has to be loud.
 */
export function protocolFor(productClass: string): Protocol | undefined {
  return BY_PRODUCT_CLASS.get(productClass);
}

export function allProductClasses(): string[] {
  return [...BY_PRODUCT_CLASS.keys()].sort();
}

/** The standards team's worklist: checkpoints still on the unassigned default. */
export function checkpointsAwaitingSeverity(): { protocol: string; ref: string; text: string }[] {
  const out: { protocol: string; ref: string; text: string }[] = [];
  for (const p of PROTOCOLS) {
    const gen = GENERATED_PROTOCOLS.find((g) => g.code === p.code);
    if (gen?.inheritsCoreSeverity) continue;
    for (const cp of p.checkpoints) {
      out.push({ protocol: p.code, ref: cp.ref, text: cp.text });
    }
  }
  return out;
}

export { CORE_PROTOCOL, CORE_CHECKPOINTS } from './core';
