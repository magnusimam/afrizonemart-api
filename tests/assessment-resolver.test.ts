import { describe, expect, it } from 'vitest';
import { checkCompleteness, resolveChecklist } from '@/modules/suppliers/assessment/resolver';
import { CORE_PROTOCOL } from '@/modules/suppliers/assessment/protocols/core';
import { emptyProfile, type AssessmentProfile } from '@/modules/suppliers/assessment/profile';
import { requiresJustification } from '@/modules/suppliers/assessment/catalogue';
import { CORE_CHECKPOINTS } from '@/modules/suppliers/assessment/protocols/core';

/**
 * Resolution is where "a human reads the PIQ and picks a form" becomes
 * machinery. The Master Index gives us the human's own answers for ~30 real
 * products, with the reasoning written out ("Cassava flour: root processing
 * requires validation of cyanide reduction"), so several of these cases are
 * taken straight from it — the engine should reach the conclusion the
 * coordinator already reached.
 */

function profile(overrides: Partial<AssessmentProfile>): AssessmentProfile {
  return { ...emptyProfile('flour-staple'), ...overrides };
}

const refsOf = (items: { ref: string }[]) => items.map((i) => i.ref);

describe('resolveChecklist — real products from the Master Index', () => {
  /** "Cassava flour — root processing requires validation of cyanide reduction
   *  and drying times." */
  it('puts HCN control on a cassava flour and leaves off aflatoxin', () => {
    const r = resolveChecklist(CORE_PROTOCOL, profile({
      substrates: ['cassava'],
      processes: ['drying', 'milling', 'fermentation'],
      metalContactSteps: true,
    }));
    const refs = refsOf(r.items);
    expect(refs).toContain('D.4');           // HCN reduction
    expect(refs).toContain('F.3');           // HCN batch testing
    expect(refs).toContain('D.6');           // fermentation monitoring
    expect(refs).not.toContain('C.3');       // no aflatoxin substrate
    expect(refs).not.toContain('F.2');
  });

  /** "P.P. Foods Beans Flour — legume milling requires pest control and shell
   *  separation equipment checks." */
  it('activates allergen segregation only when legumes share lines', () => {
    const dedicated = resolveChecklist(CORE_PROTOCOL, profile({
      substrates: ['beans'], allergensPresent: ['soy'], sharedProductionLines: false,
    }));
    const shared = resolveChecklist(CORE_PROTOCOL, profile({
      substrates: ['beans'], allergensPresent: ['soy'], sharedProductionLines: true,
    }));
    expect(refsOf(dedicated.items)).not.toContain('D.3');
    expect(refsOf(shared.items)).toContain('D.3');
  });

  /** "TOM BROWN — multi-grain mix requiring rigorous cross-contamination and
   *  pest prevention." Corn + groundnut is the aflatoxin double-substrate that
   *  produced two of Ritzy's four Criticals. */
  it('activates both aflatoxin checkpoints on a maize/groundnut composite', () => {
    const r = resolveChecklist(CORE_PROTOCOL, profile({
      productClass: 'baby-cereal',
      substrates: ['maize', 'groundnut'],
      allergensPresent: ['peanut'],
      sharedProductionLines: true,
    }));
    const refs = refsOf(r.items);
    expect(refs).toContain('C.3');
    expect(refs).toContain('F.2');
    expect(refs).toContain('D.3');
  });

  /** "Unripe Plantain Flour — health-positioned staple." The protocol names
   *  plantain explicitly as a substrate NOT aflatoxin-susceptible. */
  it('leaves aflatoxin screening off a plantain flour', () => {
    const r = resolveChecklist(CORE_PROTOCOL, profile({ substrates: ['plantain'] }));
    expect(refsOf(r.items)).not.toContain('C.3');
    expect(r.excluded.map((e) => e.ref)).toContain('C.3');
  });

  it('activates fortification checkpoints as a set, or not at all', () => {
    const plain = resolveChecklist(CORE_PROTOCOL, profile({ substrates: ['maize'] }));
    const fortified = resolveChecklist(CORE_PROTOCOL, profile({
      substrates: ['maize'], labelClaims: ['fortified'],
    }));
    for (const ref of ['A.5', 'F.5', 'H.4']) {
      expect(refsOf(plain.items)).not.toContain(ref);
      expect(refsOf(fortified.items)).toContain(ref);
    }
  });

  it('assesses export readiness only for declared export markets', () => {
    const domestic = resolveChecklist(CORE_PROTOCOL, profile({ targetMarkets: ['domestic-NG'] }));
    const exporting = resolveChecklist(CORE_PROTOCOL, profile({ targetMarkets: ['domestic-NG', 'EU'] }));
    expect(refsOf(domestic.items)).not.toContain('K.2');
    expect(refsOf(exporting.items)).toContain('K.2');
  });
});

describe('the universal Criticals', () => {
  /** "Every flour business fails instantly without them." */
  it('always includes A.2, B.4 and J.2 whatever the product', () => {
    const bare = resolveChecklist(CORE_PROTOCOL, emptyProfile());
    for (const ref of ['A.1', 'A.2', 'B.4', 'J.2']) {
      expect(refsOf(bare.items)).toContain(ref);
    }
  });

  it('offers no way to talk a fixed Critical down', () => {
    const r = resolveChecklist(CORE_PROTOCOL, emptyProfile());
    const b4 = r.items.find((i) => i.ref === 'B.4')!;
    expect(b4.allowedRatings).toEqual(['Cpt', 'C']);
    expect(b4.allowedRatings).not.toContain('M');
  });
});

describe('explainability', () => {
  it('records in plain words why each checkpoint is present', () => {
    const r = resolveChecklist(CORE_PROTOCOL, profile({ substrates: ['cassava'] }));
    expect(r.items.find((i) => i.ref === 'D.4')!.includedBecause)
      .toBe('substrates contains cassava');
    expect(r.items.find((i) => i.ref === 'A.2')!.includedBecause)
      .toBe('applies to all products');
  });

  it('records why an excluded checkpoint was left off', () => {
    const r = resolveChecklist(CORE_PROTOCOL, profile({ substrates: ['plantain'] }));
    const d4 = r.excluded.find((e) => e.ref === 'D.4')!;
    expect(d4.excludedBecause).toBe('substrates contains cassava');
  });

  it('snapshots the facts it resolved against', () => {
    const r = resolveChecklist(CORE_PROTOCOL, profile({ substrates: ['cassava'] }));
    expect(r.facts.substrates).toEqual(['cassava']);
    expect(r.protocolVersion).toBe('1.0');
    expect(r.resolvedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('accounts for every checkpoint as either included or excluded', () => {
    const r = resolveChecklist(CORE_PROTOCOL, profile({ substrates: ['cassava'] }));
    expect(r.items.length + r.excluded.length).toBe(CORE_CHECKPOINTS.length);
  });
});

describe('ordering', () => {
  it('returns items in protocol order', () => {
    const refs = refsOf(resolveChecklist(CORE_PROTOCOL, emptyProfile()).items);
    expect(refs).toEqual([...refs].sort((a, b) => {
      const [as, an] = a.split('.'); const [bs, bn] = b.split('.');
      return as === bs ? Number(an) - Number(bn) : as.localeCompare(bs);
    }));
  });
});

describe('checkCompleteness', () => {
  const checklist = resolveChecklist(CORE_PROTOCOL, profile({ substrates: ['plantain'] }));
  const allCompliant = Object.fromEntries(
    checklist.items.map((i) => [i.ref, { rating: 'Cpt' as const }]),
  );

  /**
   * The existing completeAudit requires every checkpoint in the whole category
   * template. That is exactly what breaks under customisation — a narrow product
   * line could never be completed. Completion is judged against the checklist
   * actually issued.
   */
  it('judges completion against the resolved checklist, not the full catalogue', () => {
    expect(checkCompleteness(checklist, allCompliant).complete).toBe(true);
    expect(checklist.items.length).toBeLessThan(CORE_CHECKPOINTS.length);
  });

  it('reports exactly which checkpoints are unrated', () => {
    const { 'B.4': _drop, ...rest } = allCompliant;
    const r = checkCompleteness(checklist, rest);
    expect(r.complete).toBe(false);
    expect(r.missing).toEqual(['B.4']);
  });

  it('blocks a severity above the default with no justification', () => {
    // I.1 defaults to Observation; rating it Major is a judgement call.
    const r = checkCompleteness(checklist, { ...allCompliant, 'I.1': { rating: 'M' } });
    expect(r.complete).toBe(false);
    expect(r.unjustified).toEqual(['I.1']);
  });

  it('accepts the same severity once justified', () => {
    const r = checkCompleteness(checklist, {
      ...allCompliant,
      'I.1': { rating: 'M', justification: 'Sacks stored directly on a wet floor against an outside wall.' },
    });
    expect(r.complete).toBe(true);
  });

  it('never demands justification for rating at or below the default', () => {
    const r = checkCompleteness(checklist, { ...allCompliant, 'B.3': { rating: 'Mi' } });
    expect(r.unjustified).toEqual([]);
  });
});

describe('requiresJustification', () => {
  const byRef = (ref: string) => CORE_CHECKPOINTS.find((c) => c.ref === ref)!;

  it('is true only when exceeding the documented default', () => {
    expect(requiresJustification(byRef('I.1'), 'M')).toBe(true);   // default O
    expect(requiresJustification(byRef('I.1'), 'O')).toBe(false);
    expect(requiresJustification(byRef('B.1'), 'Mi')).toBe(false); // default M — milder
  });

  it('never applies to Compliant or N/A', () => {
    expect(requiresJustification(byRef('I.1'), 'Cpt')).toBe(false);
    expect(requiresJustification(byRef('I.1'), 'NA')).toBe(false);
  });
});
