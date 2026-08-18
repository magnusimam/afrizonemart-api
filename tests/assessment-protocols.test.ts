import { describe, expect, it } from 'vitest';
import {
  PROTOCOLS,
  checkpointsAwaitingSeverity,
  getProtocol,
  protocolFor,
} from '@/modules/suppliers/assessment/protocols';
import { CORE_CHECKPOINTS } from '@/modules/suppliers/assessment/protocols/core';
import { resolveChecklist } from '@/modules/suppliers/assessment/resolver';
import { emptyProfile } from '@/modules/suppliers/assessment/profile';

/**
 * The live catalogue, generated from the CURRENT category checklists.
 *
 * The counts asserted here were validated against the source documents two ways:
 * every rating cell in every document yields exactly one checkpoint, and no ref
 * sequence has a gap. The edible-oils count is corroborated externally — ZAO's
 * published diagnostic report states "The EOB protocol contains 36 checkpoints".
 */

const byCode = (c: string) => getProtocol(c)!;

describe('the generated catalogue', () => {
  it.each([
    ['AFZ-QA-FPS-001', 43, 11],
    ['AFZ-QA-EOB-006', 36, 8],
    ['AFZ-QA-SNK-001', 39, 8],
    ['AFZ-QA-FFC-001', 36, 8],
    ['AFZ-QA-HRA-004', 58, 12],
    ['AFZ-QA-HPC-006', 54, 4],
    ['AFZ-SQA-BCRL-001', 44, 8],
  ])('%s has %d checkpoints across %d sections', (code, n, sections) => {
    const p = byCode(code as string);
    expect(p.checkpoints).toHaveLength(n as number);
    expect(p.sections).toHaveLength(sections as number);
  });

  /** ZAO's report states this number, so it is an external check on the parser. */
  it('matches the checkpoint count ZAO\'s published report states for EOB', () => {
    expect(byCode('AFZ-QA-EOB-006').checkpoints).toHaveLength(36);
  });

  it('carries 310 checkpoints against the stale file\'s 197', () => {
    const total = PROTOCOLS.reduce((n, p) => n + p.checkpoints.length, 0);
    expect(total).toBe(310);
  });

  it('has no duplicate refs within a protocol', () => {
    for (const p of PROTOCOLS) {
      const refs = p.checkpoints.map((c) => c.ref);
      expect(new Set(refs).size).toBe(refs.length);
    }
  });

  it('gives every checkpoint text, an owner and a closure action', () => {
    for (const p of PROTOCOLS) {
      for (const cp of p.checkpoints) {
        expect(cp.text.length).toBeGreaterThan(10);
        expect(cp.defaultOwnerDept).toBeTruthy();
        expect(cp.defaultClosureText).toBeTruthy();
      }
    }
  });
});

describe('flours inherits the governing severity model', () => {
  /**
   * The governing Audit Protocol document IS the flours protocol: same 43
   * checkpoints, same sections A–K, same per-section counts. That identity is
   * what makes inheritance safe here and nowhere else.
   */
  it('matches core exactly, ref for ref', () => {
    const fps = byCode('AFZ-QA-FPS-001').checkpoints.map((c) => c.ref).sort();
    const core = CORE_CHECKPOINTS.map((c) => c.ref).sort();
    expect(fps).toEqual(core);
  });

  it('restores the three universal Criticals the stale template lost', () => {
    const fps = byCode('AFZ-QA-FPS-001');
    for (const ref of ['A.1', 'A.2', 'B.4', 'J.2']) {
      expect(fps.checkpoints.find((c) => c.ref === ref)?.severityClass)
        .toBe('FIXED_CRITICAL');
    }
  });

  it('can now assess cassava cyanide control', () => {
    const fps = byCode('AFZ-QA-FPS-001');
    const d4 = fps.checkpoints.find((c) => c.ref === 'D.4')!;
    expect(d4.text.toLowerCase()).toContain('cyanide');
    expect(d4.appliesWhen).toBeDefined();
  });

  it('prefers the current document wording over the governing shorthand', () => {
    const b4 = byCode('AFZ-QA-FPS-001').checkpoints.find((c) => c.ref === 'B.4')!;
    expect(b4.text).toContain('after milling and before packaging');
  });

  it('resolves conditionally, driven by the product profile', () => {
    const fps = byCode('AFZ-QA-FPS-001');
    const cassava = resolveChecklist(fps, {
      ...emptyProfile('flour-staple'), substrates: ['cassava'], processes: ['drying'],
    });
    const plantain = resolveChecklist(fps, {
      ...emptyProfile('flour-staple'), substrates: ['plantain'], processes: ['drying'],
    });
    expect(cassava.items.map((i) => i.ref)).toContain('D.4');
    expect(plantain.items.map((i) => i.ref)).not.toContain('D.4');
    expect(cassava.items.find((i) => i.ref === 'D.4')!.includedBecause)
      .toBe('substrates contains cassava');
  });
});

describe('the other protocols await severity assignment', () => {
  /**
   * Refs are independent between protocols — honey's section C is moisture
   * control, black soap's is heavy metals, fashion's E is restricted
   * substances. Matching on ref number would attach a severity to an unrelated
   * control and look authoritative doing it.
   */
  it('never assigns a severity it cannot justify', () => {
    for (const p of PROTOCOLS) {
      if (p.code === 'AFZ-QA-FPS-001') continue;
      for (const cp of p.checkpoints) {
        expect(cp.severityClass).toBe('BY_DEGREE');
        expect(cp.defaultIfAbsent).toBe('Mi');
      }
    }
  });

  it('cannot auto-fail a supplier on an unreviewed guess', () => {
    for (const p of PROTOCOLS) {
      if (p.code === 'AFZ-QA-FPS-001') continue;
      for (const cp of p.checkpoints) {
        expect(cp.allowedRange).not.toContain('C');
      }
    }
  });

  it('lists the 267 checkpoints the standards team still owns', () => {
    expect(checkpointsAwaitingSeverity()).toHaveLength(310 - 43);
  });
});

describe('routing', () => {
  it.each([
    ['flour-staple', 'AFZ-QA-FPS-001'],
    ['edible-oil', 'AFZ-QA-EOB-006'],
    ['honey', 'AFZ-QA-HRA-004'],
    ['black-soap', 'AFZ-QA-HPC-006'],
    ['baby-cereal', 'AFZ-SQA-BCRL-001'],
    ['footwear', 'AFZ-QA-FFC-001'],
  ])('routes %s to %s', (pc, code) => {
    expect(protocolFor(pc as string)?.code).toBe(code);
  });

  /**
   * Baby cereal now has its own protocol. The stale catalogue folded it into
   * flours, which meant infant food — the highest-consequence category on the
   * platform — was assessed without its trypsin-inhibitor, heavy-metal or
   * sulphite checkpoints.
   */
  it('gives baby cereal its own protocol rather than folding it into flours', () => {
    expect(protocolFor('baby-cereal')?.code).not.toBe('AFZ-QA-FPS-001');
  });

  it('returns undefined on an unknown class instead of silently missing', () => {
    expect(protocolFor('not-a-class')).toBeUndefined();
  });
});
