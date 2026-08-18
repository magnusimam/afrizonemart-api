import { describe, expect, it } from 'vitest';
import { esc, renderReportHtml } from '@/modules/suppliers/assessment/report-html';
import { buildReport, type DiagnosticReport } from '@/modules/suppliers/assessment/report';
import { getProtocol } from '@/modules/suppliers/assessment/protocols';
import { resolveChecklist } from '@/modules/suppliers/assessment/resolver';
import { emptyProfile } from '@/modules/suppliers/assessment/profile';
import { reportFilename } from '@/modules/suppliers/assessment/pdf';

/**
 * The report's HTML is the single source for both the emailed PDF and the
 * portal view, so it carries two burdens: it has to contain the whole document,
 * and it has to be safe. Supplier names, assessor field notes and model-drafted
 * prose all reach this markup, and none of them are trusted.
 */

const fps = getProtocol('AFZ-QA-FPS-001')!;

function makeReport(overrides: {
  supplierName?: string;
  responses?: Record<string, { rating: string; findings?: string }>;
} = {}): DiagnosticReport {
  const checklist = resolveChecklist(fps, {
    ...emptyProfile('flour-staple'),
    substrates: ['cassava'], processes: ['drying'], metalContactSteps: true,
  });
  const responses: Record<string, { rating: string; findings?: string }> = {};
  for (const i of checklist.items) responses[i.ref] = { rating: 'Cpt' };
  responses['B.4'] = { rating: 'C' };
  responses['A.4'] = { rating: 'M', findings: 'NOT YET, IN VIEW' };
  responses['I.2'] = { rating: 'Mi' };
  responses['J.1'] = { rating: 'O' };

  return buildReport({
    protocol: fps, checklist,
    responses: { ...responses, ...(overrides.responses ?? {}) } as never,
    supplierName: overrides.supplierName ?? 'Eden Foods',
    supplierSlug: 'eden',
    productDescriptor: 'Manufacturer of Potato Flour',
    issuedAt: new Date('2026-06-08T00:00:00Z'),
  });
}

function approveAll(r: DiagnosticReport, text = 'Approved narrative text.') {
  for (const s of [
    r.executiveSummary.outcomeReason, r.executiveSummary.headlineFindings,
    r.executiveSummary.whatThisMeans, r.decision.narrative,
  ]) { s.draft = text; s.approved = true; }
}

describe('escaping', () => {
  it('neutralises markup in every dynamic value', () => {
    expect(esc('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(esc(`"'&`)).toBe('&quot;&#39;&amp;');
    expect(esc(null)).toBe('');
  });

  /** A supplier name comes from a self-service registration form. */
  it('escapes a hostile supplier name', () => {
    const html = renderReportHtml(makeReport({ supplierName: '<img src=x onerror=alert(1)>' }));
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  /** Assessor notes are typed on a phone in a factory and quoted verbatim. */
  it('escapes an assessor field note', () => {
    const html = renderReportHtml(makeReport({
      responses: { 'A.4': { rating: 'M', findings: '</td></table><script>x()</script>' } },
    }));
    expect(html).not.toContain('<script>x()');
    expect(html).toContain('&lt;script&gt;x()&lt;/script&gt;');
  });

  /** Model-drafted prose is untrusted markup like anything else. */
  it('escapes an authored passage but keeps its bold and bullets', () => {
    const r = makeReport();
    approveAll(r, '- **Critical**: <b>raw</b> markup\n- Second point');
    const html = renderReportHtml(r);
    expect(html).toContain('<strong>Critical</strong>');
    expect(html).toContain('&lt;b&gt;raw&lt;/b&gt;');
    expect(html).not.toContain('<b>raw</b>');
    expect(html).toContain('<li>');
  });
});

describe('the review gate is visible in the document', () => {
  /**
   * A report cannot be authorised with an unapproved passage, so if a
   * placeholder ever reaches a rendered document something skipped the gate.
   * Better that it shouts on the page than vanishes silently.
   */
  it('renders an unapproved passage as a visible placeholder', () => {
    const html = renderReportHtml(makeReport());
    expect(html).toContain('Awaiting auditor review');
    expect(html).toContain('class="banner-reason pending"');
  });

  it('renders approved passages as prose', () => {
    const r = makeReport();
    approveAll(r, 'Listing is blocked by one Critical finding.');
    const html = renderReportHtml(r);
    expect(html).not.toContain('Awaiting auditor review');
    expect(html).toContain('Listing is blocked by one Critical finding.');
  });

  it('treats an unread draft as unapproved', () => {
    const r = makeReport();
    r.executiveSummary.outcomeReason.draft = 'Drafted but nobody read it.';
    const html = renderReportHtml(r);
    expect(html).toContain('Awaiting auditor review');
    expect(html).not.toContain('Drafted but nobody read it.');
  });
});

describe('document completeness', () => {
  const html = renderReportHtml((() => { const r = makeReport(); approveAll(r); return r; })());

  it.each([
    'Executive Summary', '1. Supplier &amp; Assessment Profile', '2. Assessment Methodology',
    '3. Findings Dashboard', '4. Detailed Findings', '5. Compliance Strengths',
    '7. Recommendations', '8. Corrective &amp; Preventive Action', '9. Final Decision',
    '11. Report Acknowledgement',
  ])('includes the %s section', (heading) => {
    expect(html).toContain(heading);
  });

  it('prints the scoring legend and shows the arithmetic', () => {
    expect(html).toContain('Risk-Based Scoring Legend');
    expect(html).toContain('1 – 3 per finding');
    expect(html).toContain('How this score was calculated');
    expect(html).toContain('Critical findings and Observations carry no score weight');
  });

  it('lists every protocol checkpoint in the dashboard', () => {
    for (const cp of fps.checkpoints) {
      expect(html).toContain(`>${cp.ref}<`);
    }
  });

  /** ZAO's report does this for its fourteen inapplicable checkpoints; it is
   *  what makes a narrow scope read as deliberate rather than skipped. */
  it('states why an excluded checkpoint was not assessed', () => {
    const plantain = renderReportHtml(buildReport({
      protocol: fps,
      checklist: resolveChecklist(fps, { ...emptyProfile('flour-staple'), substrates: ['plantain'] }),
      responses: {},
      supplierName: 'Avis Foods', supplierSlug: 'avis',
      productDescriptor: 'Plantain Flour', issuedAt: new Date('2026-06-08T00:00:00Z'),
    }));
    expect(plantain).toContain('Not assessed — substrates contains cassava');
  });

  it('emits the CAPA root-cause and evidence columns blank for the supplier', () => {
    expect(html).toContain('Root Cause');
    expect(html).toContain('Evidence');
    expect(html).toContain('class="blank"');
  });

  it('carries the assessor note into the findings', () => {
    expect(html).toContain('NOT YET, IN VIEW');
  });

  it('is a self-contained document with no external requests', () => {
    expect(html).toContain('<!doctype html>');
    expect(html).not.toMatch(/<(script|iframe)\b/i);
    expect(html).not.toMatch(/\bsrc=|@import|https?:\/\//i);
  });

  /** CSS property names are necessarily American (`color:`), so check the
   *  prose only — strip the stylesheet before asserting. */
  it('uses British spelling in the prose', () => {
    const prose = html.replace(/<style>[\s\S]*?<\/style>/g, '');
    expect(prose).not.toMatch(/\b(finalize|organize|analyze|behavior|fulfill)\b/i);
  });
});

describe('filenames', () => {
  /** A mailbox with several assessments must not hold three report.pdf files. */
  it('derives a findable filename from the document code', () => {
    expect(reportFilename(makeReport())).toBe('AFZ-QA-FPS-001-DR-EDEN-001.pdf');
  });

  it('strips characters that would break a filesystem or header', () => {
    const r = makeReport();
    r.meta.documentCode = 'AFZ/QA:001 \\ DR "EDEN"';
    expect(reportFilename(r)).toBe('AFZ-QA-001-DR-EDEN.pdf');
  });
});
