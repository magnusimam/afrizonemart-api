import { logger } from '@/infra/logger';
import type { DiagnosticReport } from './report';
import { renderReportHtml } from './report-html';

/**
 * Printing a diagnostic report to PDF.
 *
 * Headless Chrome renders the very same HTML the supplier portal serves, so the
 * emailed attachment and the on-screen report cannot diverge. A PDF library
 * would mean a second layout definition, and two definitions of one document
 * drift — usually first noticed by a supplier holding an attachment that
 * disagrees with their portal.
 *
 * BROWSER LIFECYCLE. One browser instance is shared and launched lazily, so a
 * deployment that never authorises an audit never pays for Chromium starting.
 * Each render gets a fresh page; a crashed browser is discarded and relaunched
 * on the next call rather than wedging every subsequent report.
 *
 * FAILURE IS NOT FATAL. Every entry point returns null on failure. The audit
 * still completes, the supplier still gets their email, and the report is still
 * readable in the portal — they just don't get an attachment. Blocking a
 * signed-off assessment because Chromium wouldn't start would be a far worse
 * outcome than a missing PDF.
 */

// Typed loosely: puppeteer is imported dynamically so it is only resolved when
// a PDF is actually requested, and so the module still typechecks and tests in
// an environment where the browser download was skipped.
type Browser = {
  newPage(): Promise<Page>;
  close(): Promise<void>;
  connected?: boolean;
};
type Page = {
  setContent(html: string, opts: { waitUntil: string }): Promise<unknown>;
  pdf(opts: Record<string, unknown>): Promise<Uint8Array>;
  close(): Promise<void>;
};

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      if (existing.connected !== false) return existing;
    } catch {
      // Fall through and relaunch below.
    }
    browserPromise = null;
  }

  browserPromise = (async () => {
    const puppeteer = await import('puppeteer');
    const launch = (puppeteer as unknown as { default?: { launch: (o: unknown) => Promise<Browser> }; launch?: (o: unknown) => Promise<Browser> });
    const launcher = launch.default?.launch ?? launch.launch;
    if (!launcher) throw new Error('puppeteer launcher not found');
    return launcher({
      headless: true,
      // Required in most container runtimes: the default sandbox needs kernel
      // privileges a slim image does not grant, and /dev/shm is typically 64MB,
      // which Chromium exhausts on a long document.
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    });
  })();

  return browserPromise;
}

/** Release the shared browser. Call on shutdown so Chromium doesn't outlive
 *  the API process. */
export async function closePdfBrowser(): Promise<void> {
  if (!browserPromise) return;
  const pending = browserPromise;
  browserPromise = null;
  try {
    (await pending).close();
  } catch (error) {
    logger.warn('assessment.pdf.close_failed', { error: describe(error) });
  }
}

export interface RenderedPdf {
  filename: string;
  content: Buffer;
}

/** Render arbitrary report HTML to a PDF buffer, or null if it can't be done. */
export async function htmlToPdf(html: string): Promise<Buffer | null> {
  let page: Page | undefined;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    // `networkidle0` would hang: the document is fully self-contained, so there
    // is no network activity to go idle. Wait for the DOM instead.
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const bytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="width:100%;font-size:7pt;color:#555;padding:0 16mm;'
        + 'font-family:Helvetica,Arial,sans-serif;display:flex;justify-content:space-between">'
        + '<span>Confidential — Not for Public Distribution</span>'
        + '<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
      margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
    });
    return Buffer.from(bytes);
  } catch (error) {
    logger.error('assessment.pdf.render_failed', { error: describe(error) });
    // A launch failure usually means the shared browser is unusable; drop it so
    // the next call gets a fresh one instead of inheriting the broken handle.
    browserPromise = null;
    return null;
  } finally {
    await page?.close().catch(() => undefined);
  }
}

/**
 * Render a diagnostic report to an attachable PDF.
 *
 * Returns null rather than throwing — the caller carries on without an
 * attachment.
 */
export async function renderReportPdf(report: DiagnosticReport): Promise<RenderedPdf | null> {
  const content = await htmlToPdf(renderReportHtml(report));
  if (!content) return null;
  logger.info('assessment.pdf.rendered', {
    supplier: report.meta.supplierSlug,
    bytes: content.length,
  });
  return { filename: reportFilename(report), content };
}

/**
 * A filename the supplier can find again in six months.
 *
 * Built from the document code rather than something generic: a mailbox with
 * several assessments in it should not contain three files called `report.pdf`.
 */
export function reportFilename(report: DiagnosticReport): string {
  const safe = report.meta.documentCode.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-');
  return `${safe.replace(/^-|-$/g, '')}.pdf`;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
