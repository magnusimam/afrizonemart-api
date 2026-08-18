import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Drafting the report's authored passages.
 *
 * Two things matter here and they pull in opposite directions. The drafting
 * must never block a report — no key, a declined request, a malformed response
 * and a network failure all have to degrade to "the auditor writes it by hand".
 * And a draft must never escape review, because these paragraphs tell a real
 * business it has been rejected.
 *
 * Nothing in this file touches the network.
 */

const mockCreate = vi.fn();

class MockAPIError extends Error {
  constructor(public status: number) { super(`api ${status}`); }
}
class MockRateLimitError extends MockAPIError {
  constructor() { super(429); }
}
class MockAuthenticationError extends MockAPIError {
  constructor() { super(401); }
}
class MockAPIConnectionError extends MockAPIError {
  constructor() { super(0); }
}

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    beta = { messages: { create: mockCreate } };
    constructor(_opts: unknown) {}
    static APIError = MockAPIError;
    static RateLimitError = MockRateLimitError;
    static AuthenticationError = MockAuthenticationError;
    static APIConnectionError = MockAPIConnectionError;
  }
  return { default: MockAnthropic };
});

const mockEnv = { ANTHROPIC_API_KEY: 'sk-test', ASSESSMENT_NARRATIVE_MODEL: 'claude-opus-5' };
vi.mock('@/config/env', () => ({ env: mockEnv }));
vi.mock('@/infra/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { applyDrafts, draftNarrative } = await import('@/modules/suppliers/assessment/narrative');
const { buildReport, unapprovedSlots } = await import('@/modules/suppliers/assessment/report');
const { getProtocol } = await import('@/modules/suppliers/assessment/protocols');
const { resolveChecklist } = await import('@/modules/suppliers/assessment/resolver');
const { emptyProfile } = await import('@/modules/suppliers/assessment/profile');

const fps = getProtocol('AFZ-QA-FPS-001')!;

function makeReport() {
  const checklist = resolveChecklist(fps, {
    ...emptyProfile('flour-staple'),
    substrates: ['cassava'],
    processes: ['drying'],
    metalContactSteps: true,
  });
  const responses: Record<string, { rating: 'Cpt' | 'C' | 'M' | 'Mi' | 'O'; findings?: string }> = {};
  for (const i of checklist.items) responses[i.ref] = { rating: 'Cpt' };
  responses['B.4'] = { rating: 'C' };
  responses['A.4'] = { rating: 'M', findings: 'NOT YET, IN VIEW' };
  return buildReport({
    protocol: fps, checklist, responses,
    supplierName: 'Eden Foods', supplierSlug: 'eden',
    productDescriptor: 'Manufacturer of Potato Flour',
    issuedAt: new Date('2026-06-08T00:00:00Z'),
  });
}

const goodPayload = {
  outcomeReason: 'Listing blocked by a single Critical finding.',
  headlineFindings: '- **Critical**: no metal detection.',
  whatThisMeans: 'You already hold NAFDAC registration.\n\nInstalling metal detection is the blocker.',
  decisionNarrative: 'The outcome is driven by one Critical finding.',
};

const okResponse = (payload: unknown = goodPayload) => ({
  stop_reason: 'end_turn',
  model: 'claude-opus-5',
  content: [{ type: 'text', text: JSON.stringify(payload) }],
  usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0 },
});

beforeEach(() => {
  mockCreate.mockReset();
  mockEnv.ANTHROPIC_API_KEY = 'sk-test';
});

describe('degrading safely', () => {
  it('returns null and never calls the API without a key', async () => {
    mockEnv.ANTHROPIC_API_KEY = '';
    expect(await draftNarrative(makeReport())).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  /**
   * A decline arrives as a normal 200 with stop_reason "refusal", not an
   * exception — code that reads content[0] unconditionally would break here.
   * Plausible on this material: the source text is full of contamination,
   * toxin and adulteration language.
   */
  it('handles a refusal without throwing', async () => {
    mockCreate.mockResolvedValue({
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', category: 'bio' },
      model: 'claude-opus-5',
      content: [],
      usage: { input_tokens: 100, output_tokens: 0 },
    });
    expect(await draftNarrative(makeReport())).toBeNull();
  });

  it.each([
    ['malformed JSON', 'not json at all'],
    ['a missing field', JSON.stringify({ outcomeReason: 'x', headlineFindings: 'y', whatThisMeans: 'z' })],
    ['an empty field', JSON.stringify({ ...goodPayload, decisionNarrative: '   ' })],
    ['a non-string field', JSON.stringify({ ...goodPayload, whatThisMeans: 42 })],
  ])('rejects %s rather than half-filling the report', async (_label, text) => {
    mockCreate.mockResolvedValue({
      stop_reason: 'end_turn', model: 'claude-opus-5',
      content: [{ type: 'text', text }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    expect(await draftNarrative(makeReport())).toBeNull();
  });

  it('swallows API failures', async () => {
    mockCreate.mockRejectedValue(new MockRateLimitError());
    expect(await draftNarrative(makeReport())).toBeNull();
  });

  it('swallows a response with no text block', async () => {
    mockCreate.mockResolvedValue({
      stop_reason: 'end_turn', model: 'claude-opus-5',
      content: [{ type: 'thinking', thinking: '' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    expect(await draftNarrative(makeReport())).toBeNull();
  });
});

describe('the review gate', () => {
  /**
   * The whole reason drafting and approval are separate steps. A drafted
   * passage nobody has read must still block authorisation.
   */
  it('fills drafts but approves nothing', async () => {
    mockCreate.mockResolvedValue(okResponse());
    const report = makeReport();
    applyDrafts(report, (await draftNarrative(report))!);

    expect(report.executiveSummary.outcomeReason.draft).toBe(goodPayload.outcomeReason);
    expect(report.decision.narrative.draft).toBe(goodPayload.decisionNarrative);
    expect(report.executiveSummary.outcomeReason.approved).toBe(false);
    expect(unapprovedSlots(report)).toHaveLength(4);
  });

  it('releases only once a human approves each passage', async () => {
    mockCreate.mockResolvedValue(okResponse());
    const report = makeReport();
    applyDrafts(report, (await draftNarrative(report))!);
    for (const slot of [
      report.executiveSummary.outcomeReason,
      report.executiveSummary.headlineFindings,
      report.executiveSummary.whatThisMeans,
      report.decision.narrative,
    ]) slot.approved = true;
    expect(unapprovedSlots(report)).toHaveLength(0);
  });
});

describe('the request', () => {
  beforeEach(() => mockCreate.mockResolvedValue(okResponse()));
  const lastCall = () => mockCreate.mock.calls[0][0];

  it('uses adaptive thinking and no sampling parameters', async () => {
    await draftNarrative(makeReport());
    const req = lastCall();
    expect(req.model).toBe('claude-opus-5');
    expect(req.thinking).toEqual({ type: 'adaptive' });
    // Removed on this model — sending them is a 400.
    expect(req.temperature).toBeUndefined();
    expect(req.top_p).toBeUndefined();
  });

  it('constrains the output to the four passages', async () => {
    await draftNarrative(makeReport());
    const schema = lastCall().output_config.format.schema;
    expect(lastCall().output_config.format.type).toBe('json_schema');
    expect(schema.required).toEqual([
      'outcomeReason', 'headlineFindings', 'whatThisMeans', 'decisionNarrative',
    ]);
    expect(schema.additionalProperties).toBe(false);
  });

  it('opts into a fallback so a false-positive decline is not lost', async () => {
    await draftNarrative(makeReport());
    expect(lastCall().fallbacks).toBe('default');
    expect(lastCall().betas).toContain('server-side-fallback-2026-07-01');
  });

  /** Caching is a prefix match, so the frozen guide must carry the breakpoint
   *  and nothing volatile may precede it. */
  it('caches the house style and keeps supplier data out of the prefix', async () => {
    await draftNarrative(makeReport());
    const [system] = lastCall().system;
    expect(system.cache_control).toEqual({ type: 'ephemeral' });
    expect(system.text).not.toContain('Eden Foods');
    expect(system.text).not.toContain('2026');
  });

  /**
   * The cache is only ever read if the prefix is byte-identical between
   * suppliers. Capture the first prefix before the second call, or this
   * compares a value with itself and can never fail.
   */
  it('sends a byte-identical prefix for different suppliers', async () => {
    await draftNarrative(makeReport());
    const firstPrefix: string = mockCreate.mock.calls[0][0].system[0].text;

    const other = makeReport();
    other.meta.supplierName = 'Ritzy Foods';
    other.meta.supplierSlug = 'ritzy';
    await draftNarrative(other);
    const secondPrefix: string = mockCreate.mock.calls[1][0].system[0].text;

    expect(secondPrefix).toBe(firstPrefix);
    // And the briefs genuinely differ, so the prefix match isn't vacuous.
    expect(mockCreate.mock.calls[1][0].messages[0].content)
      .not.toBe(mockCreate.mock.calls[0][0].messages[0].content);
  });
});

describe('the brief', () => {
  beforeEach(() => mockCreate.mockResolvedValue(okResponse()));
  const brief = () => mockCreate.mock.calls[0][0].messages[0].content as string;

  it('carries the findings with their refs', async () => {
    await draftNarrative(makeReport());
    expect(brief()).toContain('CRITICAL FINDINGS (1)');
    expect(brief()).toContain('B.4');
    expect(brief()).toContain('MAJOR FINDINGS (1)');
    expect(brief()).toContain('A.4');
  });

  /** Shipped reports quote the auditor's note verbatim in Evidence Basis, so
   *  it is source material for the narrative, not an internal aside. */
  it('passes the auditor note through verbatim', async () => {
    await draftNarrative(makeReport());
    expect(brief()).toContain('"NOT YET, IN VIEW"');
  });

  it('states the outcome and score', async () => {
    await draftNarrative(makeReport());
    expect(brief()).toContain('REJECTED');
    expect(brief()).toContain('1 Critical');
  });

  /**
   * Comparative superlatives appear throughout the shipped reports and cannot
   * be verified without peer data — so with none, forbid them outright.
   */
  it('forbids cohort comparisons when there is no cohort', async () => {
    await draftNarrative(makeReport());
    expect(brief()).toContain('Do not make comparisons to other suppliers');
  });

  it('supplies peers when a cohort is given', async () => {
    await draftNarrative(makeReport(), {
      cycleName: 'Edo Cluster',
      peers: [{ supplierName: 'Ritzy Foods', score: 82, critical: 4, major: 6, minor: 13 }],
    });
    expect(brief()).toContain('Edo Cluster');
    expect(brief()).toContain('Ritzy Foods: 82/100');
    expect(brief()).not.toContain('Do not make comparisons');
  });

  it('flags a Red Flag escalation so the narrative can explain it', async () => {
    const checklist = resolveChecklist(fps, {
      ...emptyProfile('flour-staple'), substrates: ['cassava'], processes: ['drying'],
    });
    const responses: Record<string, { rating: 'Cpt' | 'M'; confirmedFinding?: boolean }> = {};
    for (const i of checklist.items) responses[i.ref] = { rating: 'Cpt' };
    responses['F.3'] = { rating: 'M', confirmedFinding: true };
    await draftNarrative(buildReport({
      protocol: fps, checklist, responses,
      supplierName: 'Eden Foods', supplierSlug: 'eden',
      productDescriptor: 'Cassava Flour', issuedAt: new Date('2026-06-08T00:00:00Z'),
    }));
    expect(brief()).toContain('escalated to Critical by a confirmed finding');
  });
});
