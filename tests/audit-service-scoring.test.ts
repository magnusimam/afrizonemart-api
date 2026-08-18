import { describe, expect, it, vi } from 'vitest';

// The audit service reaches for prisma and the notifier at import time; neither
// is needed to exercise the scoring path.
vi.mock('@/infra/prisma', () => ({ prisma: {} }));
vi.mock('@/modules/suppliers/notify', () => ({ notifyAuditComplete: vi.fn() }));

const { scoreAudit } = await import('@/modules/suppliers/admin.audit.service');

/**
 * `scoreAudit` is what the live POST /complete endpoint calls. These assert the
 * three behaviours that changed when it was moved onto the assessment scorer —
 * each a correction to match the reports AZM has already published, and each
 * invisible from the unit tests of the scorer itself.
 */

const responses = (spec: Record<string, { rating: string; majorPoints?: number }>) =>
  spec as never;

describe('the live scoring endpoint', () => {
  /**
   * The old implementation rounded to an integer because the column was an Int.
   * Oluwatoyin's shipped report scores 94.5 — rounding made the stored record
   * disagree with the document the supplier received.
   */
  it('keeps half points instead of rounding them away', () => {
    const r = scoreAudit(responses({
      a: { rating: 'M' }, b: { rating: 'M' },
      c: { rating: 'Mi' }, d: { rating: 'Mi' }, e: { rating: 'Mi' },
    }));
    expect(r.indicativeScore).toBe(94.5);
    expect(Number.isInteger(r.indicativeScore)).toBe(false);
  });

  /** The protocol gives the auditor a 1–3 band; this used to hard-code 2. */
  it('honours per-finding Major severity', () => {
    const light = scoreAudit(responses({ a: { rating: 'M', majorPoints: 1 } }));
    const heavy = scoreAudit(responses({ a: { rating: 'M', majorPoints: 3 } }));
    expect(light.indicativeScore).toBe(99);
    expect(heavy.indicativeScore).toBe(97);
  });

  /**
   * "No more than three permitted for any approval outcome" — and a conditional
   * listing is an approval outcome. The old code applied the cap to APPROVED
   * only, so a facility with many Majors could still land PROVISIONAL on
   * arithmetic alone.
   */
  it('blocks PROVISIONAL when Majors exceed three', () => {
    const r = scoreAudit(responses({
      a: { rating: 'M' }, b: { rating: 'M' }, c: { rating: 'M' },
      d: { rating: 'M' }, e: { rating: 'M' }, f: { rating: 'M' },
    }));
    expect(r.indicativeScore).toBe(88);   // comfortably above the 70 threshold
    expect(r.counts.major).toBe(6);
    expect(r.outcome).toBe('REJECTED');
  });

  it('still rejects outright on a single Critical', () => {
    const r = scoreAudit(responses({ a: { rating: 'C' }, b: { rating: 'Cpt' } }));
    expect(r.indicativeScore).toBe(100);
    expect(r.outcome).toBe('REJECTED');
  });

  it('reproduces Eden Foods end to end', () => {
    const spec: Record<string, { rating: string }> = {};
    let n = 0;
    const add = (rating: string, times: number) => {
      for (let i = 0; i < times; i += 1) spec[`cp${(n += 1)}`] = { rating };
    };
    add('C', 2); add('M', 4); add('Mi', 2); add('O', 8); add('Cpt', 18);
    const r = scoreAudit(responses(spec));
    expect(r.indicativeScore).toBe(91);
    expect(r.outcome).toBe('REJECTED');
  });
});
