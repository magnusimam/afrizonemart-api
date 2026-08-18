import { describe, expect, it } from 'vitest';
import {
  CAPA_DEADLINE_DAYS,
  decideOutcome,
  effectiveRating,
  normaliseMajorPoints,
  scoreAssessment,
  type ResponseMap,
} from '@/modules/suppliers/assessment/scoring';

/**
 * The scoring methodology is not written down as arithmetic anywhere. Every
 * diagnostic report AZM has shipped asserts a score without showing its working,
 * so the formula here was recovered by solving the published score/count pairs.
 *
 * That makes these tests unusually load-bearing: they are not checking that the
 * code does what we decided, they are checking that the code reproduces what
 * human auditors already signed and sent to real businesses. If one of them
 * breaks, the question is whether we changed the formula or misread the
 * protocol — not whether the fixture is stale.
 */

/** Build a response map with the given counts, using default Major severity. */
function counts(c: number, m: number, mi: number, o: number, cpt = 0, na = 0): ResponseMap {
  const map: ResponseMap = {};
  let n = 0;
  const add = (rating: 'C' | 'M' | 'Mi' | 'O' | 'Cpt' | 'NA', times: number) => {
    for (let i = 0; i < times; i += 1) { map[`cp_${(n += 1)}`] = { rating }; }
  };
  add('C', c); add('M', m); add('Mi', mi); add('O', o); add('Cpt', cpt); add('NA', na);
  return map;
}

describe('scoreAssessment — replaying the shipped diagnostic reports', () => {
  /**
   * These four have full individual reports on file, so their counts are taken
   * from the report itself rather than the cohort summary table.
   */
  it('reproduces Eden Foods: 91/100, rejected on two Criticals', () => {
    const r = scoreAssessment(counts(2, 4, 2, 8));
    expect(r.indicativeScore).toBe(91);
    expect(r.outcome).toBe('REJECTED');
  });

  it('reproduces USEDIAMEG: 70/100', () => {
    const r = scoreAssessment(counts(2, 12, 12, 5));
    expect(r.indicativeScore).toBe(70);
    expect(r.outcome).toBe('REJECTED');
  });

  /** The half-point case. An integer-rounding scorer cannot produce this, which
   *  is exactly why the score must not be rounded. */
  it('reproduces Oluwatoyin (ZAO): 94.5/100 — halves survive', () => {
    const r = scoreAssessment(counts(1, 2, 3, 5));
    expect(r.indicativeScore).toBe(94.5);
    expect(r.outcome).toBe('REJECTED');
  });

  /** Cohort-summary suppliers. Counts come from the Edo cluster scorecard. */
  it.each([
    ['Amineru', 3, 4, 8, 4, 88],
    ['Avis Foods', 2, 7, 6, 8, 83],
    ['JVV Foods', 4, 7, 10, 9, 81],
  ])('reproduces %s: %d/100', (_name, c, m, mi, o, expected) => {
    expect(scoreAssessment(counts(c as number, m as number, mi as number, o as number)).indicativeScore).toBe(expected);
  });

  /**
   * Three published scores land exactly half a point away from the formula when
   * every Major is weighted at the default 2.0:
   *
   *   Ritzy    4C/6M/13Mi → formula 81.5, published 82
   *   Varli    3C/5M/11Mi → formula 84.5, published 85
   *   P.P.     6C/15M/9Mi → formula 65.5, published 65
   *
   * Note the published values round inconsistently — 82 and 85 up, 65 down — so
   * this is not a rounding rule we can implement. The likeliest explanation is
   * that those auditors used the 1–3 Major band rather than a flat 2, which the
   * summary table doesn't record. We assert the formula's own answer and pin the
   * gap here rather than fudging the arithmetic to fit.
   *
   * TODO(QA): confirm per-finding Major severity for these three with the
   * assessment team; if confirmed, promote to exact fixtures.
   */
  it.each([
    ['Ritzy Foods', 4, 6, 13, 81.5, 82],
    ['Varli', 3, 5, 11, 84.5, 85],
    ['P.P. Foods', 6, 15, 9, 65.5, 65],
  ])('%s: formula gives %d where the report published %d', (_n, c, m, mi, formula, published) => {
    const r = scoreAssessment(counts(c as number, m as number, mi as number, 0));
    expect(r.indicativeScore).toBe(formula);
    expect(Math.abs((formula as number) - (published as number))).toBe(0.5);
  });

  /** The cohort table lists Ritzy at 42; its own report says 82. 42 would need
   *  8.6 points per Major, which the 1–3 band makes impossible. */
  it('confirms the cohort table 42 for Ritzy is unreachable', () => {
    const maxPossibleDeduction = 6 * 3 + 0.5 * 13; // every Major at the 3-point ceiling
    expect(100 - maxPossibleDeduction).toBeGreaterThan(42);
  });
});

describe('the Critical override', () => {
  it('rejects a near-perfect facility on a single Critical', () => {
    const r = scoreAssessment(counts(1, 0, 0, 0, 39));
    expect(r.indicativeScore).toBe(100);
    expect(r.outcome).toBe('REJECTED');
  });

  it('does not let Criticals reduce the score', () => {
    const none = scoreAssessment(counts(0, 2, 2, 0));
    const three = scoreAssessment(counts(3, 2, 2, 0));
    expect(three.indicativeScore).toBe(none.indicativeScore);
  });
});

describe('outcome bands', () => {
  it('approves at 85 with no Criticals and few Majors', () => {
    // 7 Majors would breach the cap, so use minors to land on 85 exactly.
    expect(scoreAssessment(counts(0, 3, 18, 0)).indicativeScore).toBe(85);
    expect(scoreAssessment(counts(0, 3, 18, 0)).outcome).toBe('APPROVED');
  });

  it('gives PROVISIONAL between 70 and 85', () => {
    expect(scoreAssessment(counts(0, 3, 20, 0)).outcome).toBe('PROVISIONAL');
  });

  it('rejects below 70', () => {
    expect(scoreAssessment(counts(0, 3, 50, 0)).outcome).toBe('REJECTED');
  });

  /**
   * The Major cap gates PROVISIONAL too. Every report's scoring legend says
   * "no more than three permitted for any approval outcome", and a conditional
   * listing is an approval outcome — a facility with twelve Majors has not
   * earned one however the arithmetic lands.
   */
  it('blocks approval outright when Majors exceed three, whatever the score', () => {
    const r = scoreAssessment(counts(0, 4, 0, 0));
    expect(r.indicativeScore).toBe(92);
    expect(r.outcome).toBe('REJECTED');
  });

  it('treats the boundary scores inclusively', () => {
    expect(decideOutcome(85, { critical: 0, major: 0, minor: 0, observation: 0, compliant: 0, na: 0 })).toBe('APPROVED');
    expect(decideOutcome(70, { critical: 0, major: 0, minor: 0, observation: 0, compliant: 0, na: 0 })).toBe('PROVISIONAL');
    expect(decideOutcome(69.5, { critical: 0, major: 0, minor: 0, observation: 0, compliant: 0, na: 0 })).toBe('REJECTED');
  });
});

describe('N/A handling', () => {
  /** ZAO had 14 of 36 checkpoints N/A and was still scored out of 100. */
  it('does not renormalise the base when checkpoints are not applicable', () => {
    const narrow = scoreAssessment(counts(0, 2, 3, 5, 12, 14));
    const broad = scoreAssessment(counts(0, 2, 3, 5, 26, 0));
    expect(narrow.indicativeScore).toBe(94.5);
    expect(broad.indicativeScore).toBe(94.5);
  });
});

describe('Major severity band', () => {
  it('defaults to 2 and clamps to 1–3', () => {
    expect(normaliseMajorPoints(undefined)).toBe(2);
    expect(normaliseMajorPoints(0)).toBe(1);
    expect(normaliseMajorPoints(9)).toBe(3);
    expect(normaliseMajorPoints(Number.NaN)).toBe(2);
  });

  it('lets the auditor vary severity within the band', () => {
    const light = scoreAssessment({ a: { rating: 'M', majorPoints: 1 } });
    const heavy = scoreAssessment({ a: { rating: 'M', majorPoints: 3 } });
    expect(light.indicativeScore).toBe(99);
    expect(heavy.indicativeScore).toBe(97);
  });
});

describe('Red Flag escalation', () => {
  it('forces a confirmed finding to Critical and records why', () => {
    const r = scoreAssessment({ 'F.2': { rating: 'M', confirmedFinding: true } });
    expect(r.counts.critical).toBe(1);
    expect(r.counts.major).toBe(0);
    expect(r.escalatedToCritical).toEqual(['F.2']);
    expect(r.outcome).toBe('REJECTED');
  });

  it('never turns a pass into a failure', () => {
    // A confirmed-event flag on a Compliant or N/A line is a data-entry error;
    // silently failing the supplier on it would be far worse than ignoring it.
    expect(effectiveRating({ rating: 'Cpt', confirmedFinding: true })).toBe('Cpt');
    expect(effectiveRating({ rating: 'NA', confirmedFinding: true })).toBe('NA');
  });
});

describe('float safety', () => {
  it('stays exact across many minor deductions', () => {
    // 0.5 accumulates cleanly in binary, but the clamp guards the general case.
    expect(scoreAssessment(counts(0, 0, 37, 0)).indicativeScore).toBe(81.5);
    expect(scoreAssessment(counts(0, 0, 200, 0)).indicativeScore).toBe(0);
  });
});

describe('CAPA deadlines', () => {
  /** Per severity, not a flat 90 days — every shipped CAPA tracker uses these. */
  it('matches the shipped trackers', () => {
    expect(CAPA_DEADLINE_DAYS).toEqual({ C: 45, Mi: 60, M: 90, O: 120 });
  });
});
