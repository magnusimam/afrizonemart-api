import { afterAll, describe, expect, it } from 'vitest';
import { closePdfBrowser, htmlToPdf, renderReportPdf } from '@/modules/suppliers/assessment/pdf';
import { buildReport } from '@/modules/suppliers/assessment/report';
import { getProtocol } from '@/modules/suppliers/assessment/protocols';
import { resolveChecklist } from '@/modules/suppliers/assessment/resolver';
import { emptyProfile } from '@/modules/suppliers/assessment/profile';

/**
 * These launch a real headless Chrome, so they are slower than the rest of the
 * suite and they are meant to be. The PDF path is the one part of report
 * delivery that depends on something outside Node, and a deploy without a
 * working browser should fail here rather than silently email every supplier a
 * report with no attachment.
 */

const LAUNCH_TIMEOUT = 90_000;

const fps = getProtocol('AFZ-QA-FPS-001')!;

function sampleReport() {
  const checklist = resolveChecklist(fps, {
    ...emptyProfile('flour-staple'),
    substrates: ['cassava'], processes: ['drying'], metalContactSteps: true,
  });
  const responses: Record<string, { rating: string }> = {};
  for (const i of checklist.items) responses[i.ref] = { rating: 'Cpt' };
  responses['B.4'] = { rating: 'C' };
  return buildReport({
    protocol: fps, checklist, responses: responses as never,
    supplierName: 'Eden Foods', supplierSlug: 'eden',
    productDescriptor: 'Manufacturer of Potato Flour',
    issuedAt: new Date('2026-06-08T00:00:00Z'),
  });
}

afterAll(async () => { await closePdfBrowser(); });

describe('printing to PDF', () => {
  it('produces a real PDF from the report HTML', async () => {
    const pdf = await renderReportPdf(sampleReport());
    expect(pdf).not.toBeNull();
    // %PDF- magic: proves a document came back rather than an error page.
    expect(pdf!.content.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf!.content.length).toBeGreaterThan(20_000);
    expect(pdf!.filename).toBe('AFZ-QA-FPS-001-DR-EDEN-001.pdf');
  }, LAUNCH_TIMEOUT);

  /** The browser is shared and launched once; the second render must not pay
   *  for a relaunch, and must not inherit a closed page. */
  it('reuses the browser across renders', async () => {
    const first = Date.now();
    await htmlToPdf('<html><body><h1>One</h1></body></html>');
    const firstMs = Date.now() - first;

    const second = Date.now();
    const pdf = await htmlToPdf('<html><body><h1>Two</h1></body></html>');
    const secondMs = Date.now() - second;

    expect(pdf).not.toBeNull();
    expect(secondMs).toBeLessThan(Math.max(firstMs, 2_000));
  }, LAUNCH_TIMEOUT);

  /**
   * The document is fully self-contained, so there is never any network
   * activity — waiting on `networkidle0` would hang until timeout. This is
   * really a guard against someone "improving" the wait condition later.
   */
  it('does not hang on a document with no network activity', async () => {
    const started = Date.now();
    const pdf = await htmlToPdf('<html><body><p>No external resources at all.</p></body></html>');
    expect(pdf).not.toBeNull();
    expect(Date.now() - started).toBeLessThan(LAUNCH_TIMEOUT);
  }, LAUNCH_TIMEOUT);

  it('survives malformed HTML rather than throwing', async () => {
    const pdf = await htmlToPdf('<html><body><div><p>unclosed');
    expect(pdf).not.toBeNull();
    expect(pdf!.subarray(0, 5).toString()).toBe('%PDF-');
  }, LAUNCH_TIMEOUT);

  it('can be closed and relaunched', async () => {
    await closePdfBrowser();
    const pdf = await htmlToPdf('<html><body><p>After close.</p></body></html>');
    expect(pdf).not.toBeNull();
  }, LAUNCH_TIMEOUT);
});
