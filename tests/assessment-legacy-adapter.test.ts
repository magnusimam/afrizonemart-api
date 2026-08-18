import { describe, expect, it } from 'vitest';
import {
  adaptLegacyTemplates,
  coverageGapsAgainstCore,
  protocolForProductClass,
} from '@/modules/suppliers/assessment/protocols/legacy-adapter';
import { resolveChecklist } from '@/modules/suppliers/assessment/resolver';
import { emptyProfile } from '@/modules/suppliers/assessment/profile';
import { CORE_CHECKPOINTS as coreRefs } from '@/modules/suppliers/assessment/protocols/core';

/**
 * The legacy generated templates are the only machine-readable copy of the
 * category checklist text we hold, but they were scraped and the quality is
 * uneven. These tests pin down exactly what the adapter salvages and what it
 * refuses to guess at, so a future regeneration of `audit-templates.ts` can't
 * quietly change the answer.
 */

const { protocols, issues } = adaptLegacyTemplates();
const byCode = (code: string) => protocols.find((p) => p.code === code)!;

describe('recovering the flattened tables', () => {
  /**
   * Template F's 77 "checkpoints" include a product-classification matrix, a
   * pre-visit document list and an outcome decision table that the scraper
   * flattened into checkpoint rows. They are currently scored as controls, and
   * completeAudit demands a rating for each.
   */
  it('separates F into 59 real checkpoints and 18 recovered rows', () => {
    expect(byCode('AFZ-QA-HRA-004').checkpoints).toHaveLength(59);
    expect(issues.filter((i) => i.kind === 'recovered-metadata')).toHaveLength(18);
  });

  it('puts F back to sections A–L', () => {
    const letters = byCode('AFZ-QA-HRA-004').sections.map((s) => s.letter);
    expect(letters).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
  });

  it('recovers F pre-visit documents rather than scoring them', () => {
    const docs = byCode('AFZ-QA-HRA-004').preVisitDocs;
    expect(docs.length).toBe(8);
    expect(docs.join(' ')).toContain('Salmonella');
  });

  /**
   * F gives Major CAPA a 14-day desk-verification window, where the FPS reports
   * use 90 days. Captured rather than assumed away — outcome rules are evidently
   * per-protocol and someone has to decide which governs.
   */
  it('captures F outcome rules verbatim instead of discarding them', () => {
    const rules = byCode('AFZ-QA-HRA-004').outcomeRules ?? [];
    expect(rules).toHaveLength(4);
    expect(rules.join(' ')).toContain('14 days');
  });

  /**
   * Templates B, C and E populate no evidence text at all, so an empty evidence
   * field there means the scraper missed it — not that the row is a table. An
   * unscoped heuristic deletes those three protocols entirely.
   */
  it.each([
    ['AFZ-QA-EOB-006', 22],
    ['AFZ-QA-SNK-001', 18],
    ['AFZ-QA-FFC-001', 47],
  ])('keeps every checkpoint in %s, which has no evidence column', (code, n) => {
    expect(byCode(code as string).checkpoints).toHaveLength(n as number);
  });

  it('leaves 197 real checkpoints from 215 scraped rows', () => {
    const total = protocols.reduce((n, p) => n + p.checkpoints.length, 0);
    expect(total).toBe(197);
  });
});

describe('the legacy templates are a stale generation', () => {
  /**
   * The headline finding. Legacy category A is an older, shorter flours
   * checklist: 31 checkpoints across A–L against the governing protocol's 40
   * across A–K. The first refs coincide, which makes it look aligned, but the
   * numbering diverges straight after.
   *
   * These assertions are deliberately phrased as "this template CANNOT assess
   * X". They should start failing the moment the templates are regenerated from
   * the current document set — that is the signal we want.
   */
  it('cannot assess metal detection, a universal Critical', () => {
    const gaps = coverageGapsAgainstCore(byCode('AFZ-QA-FPS-001'));
    expect(gaps.map((g) => g.ref)).toContain('B.4');
    expect(gaps.find((g) => g.ref === 'B.4')!.universalCritical).toBe(true);
  });

  /**
   * The sharpest version: the Master Index routes cassava flour to this
   * template because "root processing requires validation of cyanide reduction"
   * — and the template has no cyanide checkpoint at all.
   */
  it('cannot assess cassava cyanide control despite being the cassava template', () => {
    const refs = coverageGapsAgainstCore(byCode('AFZ-QA-FPS-001')).map((g) => g.ref);
    expect(refs).toContain('D.4');
  });

  it('is missing 14 governed controls including HACCP and fortification', () => {
    const refs = coverageGapsAgainstCore(byCode('AFZ-QA-FPS-001')).map((g) => g.ref);
    expect(refs).toEqual([
      'A.4', 'A.5', 'B.4', 'C.4', 'D.4', 'D.5', 'D.6',
      'E.4', 'F.4', 'F.5', 'G.3', 'I.3', 'J.3', 'K.2',
    ]);
  });

  /**
   * Six refs exist in both but name a completely different control. This is the
   * finding that makes ref-based inheritance indefensible — and it is invisible
   * to any diff that only compares ref sets.
   *
   * C.3 is the one that should worry the QA team most. Two of Ritzy Foods' four
   * Criticals were aflatoxin-related, one of them C.3 intake screening — a
   * checkpoint this template does not contain, because its C.3 is traceability.
   */
  it('reuses six refs for entirely different controls', () => {
    const core = new Map(
      coreRefs.map((c) => [c.ref, c.text.toLowerCase()]),
    );
    const collisions: string[] = [];
    for (const cp of byCode('AFZ-QA-FPS-001').checkpoints) {
      const coreText = core.get(cp.ref);
      if (!coreText) continue;
      const words = (s: string) => new Set(s.match(/[a-z]{5,}/g) ?? []);
      const a = words(coreText);
      const shared = [...words(cp.text.toLowerCase())].filter((w) => a.has(w));
      if (shared.length === 0) collisions.push(cp.ref);
    }
    expect(collisions).toEqual(['A.3', 'C.3', 'H.3', 'H.4', 'J.2', 'K.1']);
  });

  /**
   * A ref-level diff UNDERSTATES the damage, and this is the case that proves
   * why inheriting severity by ref would have been dangerous.
   *
   * Comparing refs says J.2 is covered. It isn't: legacy J.2 is "documented
   * food safety, hygiene and allergen awareness training" — the governing
   * protocol's J.1 — while the drilled recall procedure that J.2 actually names
   * sits at L.1, bundled with complaint management and therefore not a
   * standalone Critical at all.
   *
   * Had the adapter inherited by ref, FIXED_CRITICAL recall severity would have
   * been attached to a staff-training checkpoint, and a supplier could have been
   * auto-rejected for an undocumented training matrix.
   */
  it('shows only B.4 as a ref-level gap while J.2 silently means something else', () => {
    const fps = byCode('AFZ-QA-FPS-001');
    const universalGaps = coverageGapsAgainstCore(fps).filter((g) => g.universalCritical);
    expect(universalGaps.map((g) => g.ref)).toEqual(['B.4']);

    const legacyJ2 = fps.checkpoints.find((c) => c.ref === 'J.2')!;
    expect(legacyJ2.text.toLowerCase()).toContain('training');
    expect(legacyJ2.text.toLowerCase()).not.toContain('recall');
  });
});

describe('severity inheritance', () => {
  /**
   * Nothing inherits by ref, including category A. Attaching the governing
   * document's severity to whatever checkpoint happens to share a number would
   * look authoritative and be wrong — worse than declaring it unmapped.
   */
  it('never invents a severity it cannot justify', () => {
    for (const p of protocols) {
      for (const cp of p.checkpoints) {
        expect(cp.severityClass).toBe('BY_DEGREE');
        expect(cp.allowedRange).toEqual(['Mi', 'M']);
      }
    }
  });

  it('reports every unmapped checkpoint as work for the standards team', () => {
    const unmapped = issues.filter((i) => i.kind === 'no-severity-mapping');
    expect(unmapped).toHaveLength(197);
  });
});

describe('routing', () => {
  it('routes real product classes to their protocol', () => {
    expect(protocolForProductClass('flour-staple', protocols)?.code).toBe('AFZ-QA-FPS-001');
    expect(protocolForProductClass('honey', protocols)?.code).toBe('AFZ-QA-HRA-004');
    expect(protocolForProductClass('footwear', protocols)?.code).toBe('AFZ-QA-FFC-001');
    expect(protocolForProductClass('black-soap', protocols)?.code).toBe('AFZ-QA-HPC-006');
  });

  /**
   * The legacy getAuditTemplate() takes unvalidated free text and silently
   * returns null, which is why the visit form and audit currently receive
   * nothing for most suppliers. A miss has to be visible.
   */
  it('returns undefined for an unknown class instead of a silent miss', () => {
    expect(protocolForProductClass('not-a-real-class', protocols)).toBeUndefined();
  });
});

describe('end to end with the resolver', () => {
  it('resolves a real protocol into a usable checklist', () => {
    const fps = byCode('AFZ-QA-FPS-001');
    const checklist = resolveChecklist(fps, {
      ...emptyProfile('flour-staple'),
      substrates: ['cassava'],
      processes: ['drying', 'fermentation'],
    });
    expect(checklist.items.length).toBeGreaterThan(20);
    expect(checklist.protocolCode).toBe('AFZ-QA-FPS-001');
    // No conditional rules survive the legacy import, so every checkpoint is
    // unconditional — which is precisely the gap the real protocols must close.
    expect(checklist.excluded).toHaveLength(0);
    expect(checklist.items.every((i) => i.includedBecause === 'applies to all products')).toBe(true);
  });

  it('produces no checkpoint without an owner or closure text', () => {
    for (const p of protocols) {
      for (const cp of p.checkpoints) {
        expect(cp.defaultOwnerDept).toBeTruthy();
        expect(cp.defaultClosureText).toBeTruthy();
      }
    }
  });
});
