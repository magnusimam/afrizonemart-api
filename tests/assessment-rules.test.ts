import { describe, expect, it } from 'vitest';
import { evaluatePredicate, type Predicate } from '@/modules/suppliers/assessment/rules';

/**
 * These rules decide which safety checkpoints an auditor is shown. A rule that
 * wrongly evaluates false doesn't throw — it silently removes a checkpoint from
 * the checklist, and a facility gets assessed without anyone noticing the gap.
 * So the interesting cases here are the negative ones.
 */

const cassavaFlour = {
  productClass: 'flour-staple',
  substrates: ['cassava'],
  processes: ['drying', 'milling', 'fermentation'],
  labelClaims: [],
  allergensPresent: [],
  sharedProductionLines: false,
  targetMarkets: ['domestic-NG'],
};

const fortifiedCereal = {
  productClass: 'baby-cereal',
  substrates: ['maize', 'soy'],
  processes: ['milling', 'gelatinisation'],
  labelClaims: ['fortified'],
  allergensPresent: ['soy'],
  sharedProductionLines: true,
  targetMarkets: ['domestic-NG', 'AfCFTA', 'EU'],
};

describe('the real protocol rules', () => {
  /** D.4 / F.3 — HCN reduction and batch testing for cassava. */
  const cassavaRule: Predicate = { fact: 'substrates', op: 'contains', value: 'cassava' };

  it('activates HCN checkpoints for cassava and not otherwise', () => {
    expect(evaluatePredicate(cassavaRule, cassavaFlour).matched).toBe(true);
    expect(evaluatePredicate(cassavaRule, fortifiedCereal).matched).toBe(false);
  });

  it('explains itself in words the supplier can read', () => {
    expect(evaluatePredicate(cassavaRule, cassavaFlour).reason).toBe('substrates contains cassava');
  });

  /** A.5 / F.5 / H.4 — fortification only when the label claims it. */
  it('activates fortification checkpoints only on a label claim', () => {
    const rule: Predicate = { fact: 'labelClaims', op: 'contains', value: 'fortified' };
    expect(evaluatePredicate(rule, fortifiedCereal).matched).toBe(true);
    expect(evaluatePredicate(rule, cassavaFlour).matched).toBe(false);
  });

  /** D.3 — allergen segregation needs BOTH legumes and shared lines. */
  const allergenRule: Predicate = {
    all: [
      { fact: 'substrates', op: 'containsAny', value: ['soy', 'groundnut'] },
      { fact: 'sharedProductionLines', op: 'isTrue' },
    ],
  };

  it('requires both legumes and shared lines', () => {
    expect(evaluatePredicate(allergenRule, fortifiedCereal).matched).toBe(true);
    expect(evaluatePredicate(allergenRule, cassavaFlour).matched).toBe(false);
  });

  it('does not fire for a legume producer on dedicated lines', () => {
    const dedicated = { ...fortifiedCereal, sharedProductionLines: false };
    const result = evaluatePredicate(allergenRule, dedicated);
    expect(result.matched).toBe(false);
    // The reason names the clause that failed, not the whole rule.
    expect(result.reason).toBe('sharedProductionLines is true');
  });

  /** C.3 / F.2 — aflatoxin screening for susceptible substrates. */
  it('activates aflatoxin screening for maize, sorghum or groundbean', () => {
    const rule: Predicate = {
      fact: 'substrates', op: 'containsAny', value: ['maize', 'sorghum', 'groundbean', 'groundnut'],
    };
    expect(evaluatePredicate(rule, fortifiedCereal).matched).toBe(true);
    // Plantain is explicitly called out in the protocol as not susceptible.
    expect(evaluatePredicate(rule, { substrates: ['plantain'] }).matched).toBe(false);
  });

  /** K.1 / K.2 — export readiness only matters if actually exporting. */
  it('activates export checkpoints only beyond the domestic market', () => {
    const rule: Predicate = {
      not: { fact: 'targetMarkets', op: 'eq', value: ['domestic-NG'] },
    };
    expect(evaluatePredicate(rule, fortifiedCereal).matched).toBe(true);
    // Array identity: eq compares by reference for arrays, so express
    // domestic-only as "does not contain any export market" instead.
    const better: Predicate = {
      not: { fact: 'targetMarkets', op: 'containsAny', value: ['AfCFTA', 'EU', 'US-FDA', 'UK'] },
    };
    expect(evaluatePredicate(better, cassavaFlour).matched).toBe(true);
    expect(evaluatePredicate(better, fortifiedCereal).matched).toBe(false);
  });

  /** D.6 — fermentation monitoring. Garri and fufu are fermented cassava. */
  it('activates fermentation monitoring from the process list, not the name', () => {
    const rule: Predicate = { fact: 'processes', op: 'contains', value: 'fermentation' };
    expect(evaluatePredicate(rule, cassavaFlour).matched).toBe(true);
    expect(evaluatePredicate(rule, fortifiedCereal).matched).toBe(false);
  });
});

describe('structure', () => {
  it('treats an absent rule as universally applicable', () => {
    const r = evaluatePredicate(undefined, {});
    expect(r.matched).toBe(true);
    expect(r.reason).toBe('applies to all products');
  });

  it('handles nested any/all/not', () => {
    const rule: Predicate = {
      any: [
        { all: [{ fact: 'a', op: 'isTrue' }, { fact: 'b', op: 'isTrue' }] },
        { not: { fact: 'c', op: 'isTrue' } },
      ],
    };
    expect(evaluatePredicate(rule, { a: true, b: true, c: true }).matched).toBe(true);
    expect(evaluatePredicate(rule, { a: false, b: true, c: false }).matched).toBe(true);
    expect(evaluatePredicate(rule, { a: false, b: true, c: true }).matched).toBe(false);
  });

  it('reads nested facts by dotted path', () => {
    const rule: Predicate = { fact: 'facility.hasMetalDetector', op: 'isTrue' };
    expect(evaluatePredicate(rule, { facility: { hasMetalDetector: true } }).matched).toBe(true);
  });
});

describe('failing safe', () => {
  /**
   * Every one of these must evaluate false rather than true. A checkpoint that
   * fails open disappears from the checklist and nothing looks wrong — which is
   * the worst failure mode available to a safety assessment.
   */
  it('rejects an unknown operator instead of passing', () => {
    const rule = { fact: 'substrates', op: 'sortOf' } as unknown as Predicate;
    expect(evaluatePredicate(rule, cassavaFlour).matched).toBe(false);
  });

  it('does not match on a missing fact', () => {
    expect(evaluatePredicate({ fact: 'nope', op: 'contains', value: 'x' }, {}).matched).toBe(false);
    expect(evaluatePredicate({ fact: 'nope', op: 'isTrue' }, {}).matched).toBe(false);
  });

  it('does not match when the fact is the wrong shape', () => {
    // `substrates` arrived as a string instead of an array — a real risk while
    // profiles are being migrated from free-text PIQ answers.
    const facts = { substrates: 'cassava' };
    expect(evaluatePredicate({ fact: 'substrates', op: 'contains', value: 'cassava' }, facts).matched).toBe(false);
  });

  it('does not treat a truthy value as true', () => {
    expect(evaluatePredicate({ fact: 'x', op: 'isTrue' }, { x: 1 }).matched).toBe(false);
    expect(evaluatePredicate({ fact: 'x', op: 'isTrue' }, { x: 'yes' }).matched).toBe(false);
  });

  it('does not compare non-numbers numerically', () => {
    expect(evaluatePredicate({ fact: 'x', op: 'gt', value: 5 }, { x: '10' }).matched).toBe(false);
  });

  it('returns false for an empty any[]', () => {
    expect(evaluatePredicate({ any: [] }, {}).matched).toBe(false);
  });

  it('returns true for an empty all[]', () => {
    expect(evaluatePredicate({ all: [] }, {}).matched).toBe(true);
  });
});
