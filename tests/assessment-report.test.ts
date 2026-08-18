import { describe, expect, it } from 'vitest';
import { buildReport, unapprovedSlots } from '@/modules/suppliers/assessment/report';
import { getProtocol } from '@/modules/suppliers/assessment/protocols';
import { resolveChecklist } from '@/modules/suppliers/assessment/resolver';
import { emptyProfile } from '@/modules/suppliers/assessment/profile';
import { deriveFindings, buildDashboard } from '@/modules/suppliers/assessment/findings';
import type { AssessmentResponse } from '@/modules/suppliers/assessment/scoring';

/**
 * The generator's job is to remove authoring work without removing judgement.
 * These tests hold both halves of that: the derived sections must come out
 * complete and internally consistent, and the four genuinely authored passages
 * must stay empty until a human fills them.
 */

const fps = getProtocol('AFZ-QA-FPS-001')!;
const issuedAt = new Date('2026-06-08T00:00:00Z');

function checklistFor(overrides = {}) {
  return resolveChecklist(fps, {
    ...emptyProfile('flour-staple'),
    substrates: ['cassava'],
    processes: ['drying', 'fermentation'],
    metalContactSteps: true,
    waterUsedInProcess: true,
    ...overrides,
  });
}

/** Rate every item Compliant, then override specific refs. */
function respond(checklist: ReturnType<typeof checklistFor>, overrides: Record<string, AssessmentResponse & { findings?: string }>) {
  const r: Record<string, AssessmentResponse & { findings?: string }> = {};
  for (const i of checklist.items) r[i.ref] = { rating: 'Cpt' };
  return { ...r, ...overrides };
}

const build = (checklist: ReturnType<typeof checklistFor>, responses: Record<string, AssessmentResponse & { findings?: string }>) =>
  buildReport({
    protocol: fps, checklist, responses,
    supplierName: 'Eden Foods', supplierSlug: 'eden',
    productDescriptor: 'Manufacturer of Potato Flour',
    issuedAt,
  });

describe('document identity', () => {
  it('builds the shipped document-code format', () => {
    const c = checklistFor();
    expect(build(c, respond(c, {})).meta.documentCode)
      .toBe('AFZ-QA-FPS-001 / DR-EDEN-001');
  });

  /** Slugs are stored, not derived: the real reports are inconsistent
   *  (Eden Foods → EDEN, Oluwatoyin Integrated Farms → ZAO). */
  it('uses the stored slug rather than deriving one from the name', () => {
    const c = checklistFor();
    const r = buildReport({
      protocol: fps, checklist: c, responses: respond(c, {}),
      supplierName: 'Oluwatoyin Integrated Farms', supplierSlug: 'zao',
      productDescriptor: 'Cold-Pressed Coconut Oil', issuedAt,
    });
    expect(r.meta.documentCode).toContain('DR-ZAO-001');
  });

  it('dates in British long form, as the shipped reports do', () => {
    const c = checklistFor();
    expect(build(c, respond(c, {})).meta.issueDate).toBe('08 June 2026');
  });
});

describe('the methodology explainer', () => {
  /**
   * Eden Foods scored 91 and was rejected outright. Without this sentence the
   * report reads as self-contradictory to the supplier receiving it.
   */
  it('explains why a high score can still fail', () => {
    const c = checklistFor();
    const r = build(c, respond(c, { 'B.4': { rating: 'C' }, 'J.2': { rating: 'C' } }));
    expect(r.executiveSummary.methodologyNote)
      .toContain('regardless of total score');
    expect(r.executiveSummary.methodologyNote).toContain('2 Critical findings');
    expect(r.executiveSummary.outcome).toBe('REJECTED');
    expect(r.executiveSummary.scoreStrip.indicativeScore).toBe(100);
  });

  it('explains a Major-count failure differently from a Critical one', () => {
    const c = checklistFor();
    const majors = Object.fromEntries(
      c.items.slice(0, 5).map((i) => [i.ref, { rating: 'M' as const }]),
    );
    const r = build(c, respond(c, majors));
    expect(r.executiveSummary.methodologyNote).toContain('No more than 3 Major findings');
    expect(r.executiveSummary.outcome).toBe('REJECTED');
  });

  /** The shipped reports only ever assert a score; showing the arithmetic is
   *  what makes it checkable by the supplier. */
  it('shows its working', () => {
    const c = checklistFor();
    const r = build(c, respond(c, { 'I.1': { rating: 'M' }, 'I.2': { rating: 'Mi' } }));
    expect(r.methodology.workedArithmetic).toContain('100 − 2 (Major) − 0.5 (Minor');
    expect(r.methodology.workedArithmetic).toContain('= 97.5');
    expect(r.methodology.workedArithmetic).toContain('Critical findings and Observations carry no score weight');
  });

  it('prints the scoring legend verbatim', () => {
    const c = checklistFor();
    const legend = build(c, respond(c, {})).methodology.scoringLegend;
    expect(legend).toHaveLength(5);
    expect(legend[1].weight).toBe('1 – 3 per finding');
    expect(legend[2].definition).toContain('CAPA within 60 days');
  });
});

describe('CAPA is fully derived', () => {
  const c = checklistFor();
  const report = build(c, respond(c, {
    'B.4': { rating: 'C' },
    'J.2': { rating: 'C' },
    'D.6': { rating: 'M' },
    'I.2': { rating: 'Mi' },
    'J.1': { rating: 'O' },
  }));

  it('assigns per-severity deadlines, not a flat 90 days', () => {
    const by = Object.fromEntries(report.capa.rows.map((r) => [r.ref, r.deadlineDays]));
    expect(by['B.4']).toBe(45);
    expect(by['I.2']).toBe(60);
    expect(by['D.6']).toBe(90);
    expect(by['J.1']).toBe(120);
  });

  it('dates the deadlines from report issue', () => {
    const b4 = report.capa.rows.find((r) => r.ref === 'B.4')!;
    expect(b4.dueDate).toBe('2026-07-23');   // 8 June + 45 days
  });

  /** Owners are departments, never people, and reproduce the shipped trackers. */
  it('assigns the owner departments the shipped trackers use', () => {
    const by = Object.fromEntries(report.capa.rows.map((r) => [r.ref, r.owner]));
    expect(by['B.4']).toBe('Production / Engineering');
    expect(by['J.2']).toBe('QA Lead');
    expect(by['I.2']).toBe('Warehouse');
    expect(by['J.1']).toBe('HR / QA');
  });

  /** The printed table has five columns but the intro asks the supplier to
   *  complete root cause and evidence, so they are emitted blank. */
  it('emits the two supplier-completed columns empty', () => {
    for (const row of report.capa.rows) {
      expect(row.rootCause).toBe('');
      expect(row.evidence).toBe('');
    }
  });

  it('covers every finding and nothing else', () => {
    expect(report.capa.rows.map((r) => r.ref).sort())
      .toEqual(['B.4', 'D.6', 'I.2', 'J.1', 'J.2']);
  });
});

describe('findings presentation', () => {
  it('uses cards for few Majors and a table for many', () => {
    const c = checklistFor();
    const few = build(c, respond(c, { 'I.1': { rating: 'M' }, 'I.2': { rating: 'M' } }));
    expect(few.findings.majorsAsCards).toBe(true);
    expect(few.findings.intro).toContain('Critical and Major findings are presented as full detail cards');

    const many = Object.fromEntries(c.items.slice(0, 6).map((i) => [i.ref, { rating: 'M' as const }]));
    const lots = build(c, respond(c, many));
    expect(lots.findings.majorsAsCards).toBe(false);
    expect(lots.findings.intro).toContain('Major, Minor and Observation findings are presented in structured tables');
  });

  it('orders findings by severity', () => {
    const c = checklistFor();
    const r = build(c, respond(c, {
      'J.1': { rating: 'O' }, 'I.2': { rating: 'Mi' },
      'D.6': { rating: 'M' }, 'B.4': { rating: 'C' },
    }));
    expect(r.findings.critical.map((f) => f.ref)).toEqual(['B.4']);
    expect(r.findings.major.map((f) => f.ref)).toEqual(['D.6']);
    expect(r.findings.minor.map((f) => f.ref)).toEqual(['I.2']);
    expect(r.findings.observation.map((f) => f.ref)).toEqual(['J.1']);
  });

  /** Shipped reports quote the auditor's note verbatim in Evidence Basis, so
   *  it is report content rather than an internal comment. */
  it('carries the auditor note through to the finding', () => {
    const c = checklistFor();
    const r = build(c, respond(c, {
      'A.4': { rating: 'M', findings: 'NOT YET, IN VIEW' },
    }));
    expect(r.findings.major.find((f) => f.ref === 'A.4')!.auditorNote).toBe('NOT YET, IN VIEW');
  });

  it('marks a Red Flag escalation so the report can explain it', () => {
    const c = checklistFor();
    const r = build(c, respond(c, {
      'F.3': { rating: 'M', confirmedFinding: true },
    }));
    const f = r.findings.critical.find((x) => x.ref === 'F.3')!;
    expect(f.escalated).toBe(true);
  });
});

describe('the conformity dashboard', () => {
  it('lists excluded checkpoints with the reason, rather than hiding them', () => {
    const c = checklistFor({ substrates: ['plantain'] });
    const rows = buildDashboard(c, {});
    const d4 = rows.find((r) => r.ref === 'D.4')!;
    expect(d4.rating).toBe('NA');
    expect(d4.notApplicableBecause).toBe('substrates contains cassava');
  });

  it('accounts for every checkpoint in the protocol', () => {
    const c = checklistFor();
    expect(buildDashboard(c, {})).toHaveLength(fps.checkpoints.length);
  });
});

describe('the roadmap mirrors the CAPA windows', () => {
  it('phases at 45 / 90 / 120 days and omits empty phases', () => {
    const c = checklistFor();
    const r = build(c, respond(c, { 'B.4': { rating: 'C' }, 'I.2': { rating: 'Mi' } }));
    expect(r.roadmap.map((p) => p.windowDays)).toEqual([45, 90]);
  });
});

describe('re-assessment conditions', () => {
  it('states how many Majors must close, with the arithmetic done', () => {
    const c = checklistFor();
    const majors = Object.fromEntries(c.items.slice(0, 7).map((i) => [i.ref, { rating: 'M' as const }]));
    const r = build(c, respond(c, majors));
    expect(r.decision.conditions[1]).toContain('closing at least 4 of the current 7');
  });

  it('names the Criticals that must clear', () => {
    const c = checklistFor();
    const r = build(c, respond(c, { 'B.4': { rating: 'C' }, 'J.2': { rating: 'C' } }));
    expect(r.decision.conditions[0]).toContain('B.4, J.2');
  });

  it('builds milestones only for the severities actually present', () => {
    const c = checklistFor();
    const days = build(c, respond(c, { 'I.2': { rating: 'Mi' } })).decision.milestones.map((m) => m.day);
    expect(days).toContain('Day 60');
    expect(days).not.toContain('Day 45');   // no Criticals
    expect(days).not.toContain('Day 90');   // no Majors
  });
});

describe('the authored passages stay human', () => {
  /**
   * The whole point of the split. Roughly 88% of the document is generated;
   * the remaining ~1,000 words make a rejection decision about a real business
   * and must be read by someone before release.
   */
  it('leaves all four authored slots empty and unapproved', () => {
    const c = checklistFor();
    const r = build(c, respond(c, { 'B.4': { rating: 'C' } }));
    expect(unapprovedSlots(r)).toHaveLength(4);
    expect(r.executiveSummary.outcomeReason.draft).toBe('');
    expect(r.executiveSummary.outcomeReason.approved).toBe(false);
  });

  it('gives each slot a brief telling the auditor what it must do', () => {
    const c = checklistFor();
    const r = build(c, respond(c, {}));
    expect(r.executiveSummary.whatThisMeans.brief).toContain('Eden Foods');
    expect(r.decision.narrative.brief).toContain('maximum of three');
  });

  it('still blocks release when a draft exists but nobody has read it', () => {
    const c = checklistFor();
    const r = build(c, respond(c, {}));
    r.executiveSummary.outcomeReason.draft = 'Drafted but unread.';
    expect(unapprovedSlots(r)).toContain('executive summary — outcome reason');
  });
});

describe('house style', () => {
  it('uses British spelling', () => {
    const c = checklistFor();
    const r = build(c, respond(c, { 'D.6': { rating: 'M' } }));
    const prose = JSON.stringify(r);
    expect(prose).not.toMatch(/\bfinalize|organiz|analyz|\bcolor\b/i);
  });
});
