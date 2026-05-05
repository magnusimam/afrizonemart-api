import type { Request, Response } from 'express';
import { HttpError } from '@/middleware/error-handler';
import {
  bulkAssignBodySchema,
  claimQueueBodySchema,
  reassignBodySchema,
  reviewSubmissionBodySchema,
  submitImagesBodySchema,
} from './schema';
import {
  bulkAssign,
  claimFromUnassignedPool,
  getApprovedExport,
  getApprovedTotals,
  getDefaultPayRate,
  getInternProgress,
  getInternQueue,
  getInternSelfStats,
  listSubmissionsForReview,
  reassign,
  reviewSubmission,
  setDefaultPayRate,
  submitImages,
} from './service';

/// The auth middleware decorates Request.user; reuse the shape used
/// elsewhere in the codebase.
type AuthedReq = Request & { user?: { id: string; email: string } };

// ---- Intern endpoints (gated by products.image-only) ---------------

export async function getMyQueueHandler(req: Request, res: Response): Promise<void> {
  const userId = (req as AuthedReq).user?.id;
  if (!userId) throw HttpError.unauthorized();
  res.json(await getInternQueue(userId));
}

export async function getMyStatsHandler(req: Request, res: Response): Promise<void> {
  const userId = (req as AuthedReq).user?.id;
  if (!userId) throw HttpError.unauthorized();
  res.json(await getInternSelfStats(userId));
}

export async function claimFromPoolHandler(req: Request, res: Response): Promise<void> {
  const userId = (req as AuthedReq).user?.id;
  if (!userId) throw HttpError.unauthorized();
  const body = claimQueueBodySchema.parse(req.body ?? {});
  res.json(await claimFromUnassignedPool(userId, body));
}

export async function submitImagesHandler(req: Request, res: Response): Promise<void> {
  const userId = (req as AuthedReq).user?.id;
  if (!userId) throw HttpError.unauthorized();
  const productId = req.params.id;
  if (!productId) throw HttpError.badRequest('Missing product id');
  const body = submitImagesBodySchema.parse(req.body);
  res.status(201).json(await submitImages(userId, productId, body));
}

// ---- Admin endpoints (ADMIN-only) ---------------------------------

export async function adminBulkAssignHandler(req: Request, res: Response): Promise<void> {
  const body = bulkAssignBodySchema.parse(req.body);
  res.json(await bulkAssign(body));
}

export async function adminReassignHandler(req: Request, res: Response): Promise<void> {
  const body = reassignBodySchema.parse(req.body);
  res.json(await reassign(body));
}

export async function adminGetProgressHandler(_req: Request, res: Response): Promise<void> {
  res.json(await getInternProgress());
}

export async function adminListSubmissionsHandler(req: Request, res: Response): Promise<void> {
  const status = (req.query.status as string | undefined) ?? 'PENDING_REVIEW';
  const internId = (req.query.internId as string | undefined) || undefined;
  const valid = ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ALL'] as const;
  if (!valid.includes(status as (typeof valid)[number])) {
    throw HttpError.badRequest(`status must be one of: ${valid.join(', ')}`);
  }
  res.json(
    await listSubmissionsForReview(status as (typeof valid)[number], internId),
  );
}

export async function adminReviewSubmissionHandler(req: Request, res: Response): Promise<void> {
  const submissionId = req.params.id;
  if (!submissionId) throw HttpError.badRequest('Missing submission id');
  const body = reviewSubmissionBodySchema.parse(req.body);
  const reviewerId = (req as AuthedReq).user?.id;
  if (!reviewerId) throw HttpError.unauthorized();
  res.json(await reviewSubmission(submissionId, body, reviewerId));
}

// ---- Pay rate setting ---------------------------------------------

export async function adminGetPayRateHandler(_req: Request, res: Response): Promise<void> {
  res.json({ rate: await getDefaultPayRate() });
}

export async function adminSetPayRateHandler(req: Request, res: Response): Promise<void> {
  const rate = Number(req.body?.rate);
  if (!Number.isFinite(rate) || rate < 0) {
    throw HttpError.badRequest('Body must be { "rate": <NGN integer ≥ 0> }');
  }
  const reviewerId = (req as AuthedReq).user?.id ?? null;
  res.json(await setDefaultPayRate(rate, reviewerId));
}

// ---- CSV export for payday ----------------------------------------

function parseDateParam(v: unknown): Date | undefined {
  if (typeof v !== 'string' || !v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function escapeCsvCell(value: string | number): string {
  const s = String(value);
  // RFC 4180: quote when the cell contains comma / quote / newline,
  // and double-up any embedded quotes.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function adminExportCsvHandler(req: Request, res: Response): Promise<void> {
  const fromDate = parseDateParam(req.query.from);
  const toDate = parseDateParam(req.query.to);
  const internId = (req.query.internId as string | undefined) || undefined;

  const [rows, totals] = await Promise.all([
    getApprovedExport({ fromDate, toDate, internId }),
    getApprovedTotals({ fromDate, toDate, internId }),
  ]);

  const totalRows = rows.length;
  const totalNgn = rows.reduce((acc, r) => acc + r.payRateNgn, 0);

  const lines: string[] = [];
  // Top-of-file header block — readable in Excel as comments since
  // every line starts with #. Finance can ignore or strip.
  lines.push(`# Afrizonemart intern image-update payroll export`);
  lines.push(`# Generated: ${new Date().toISOString()}`);
  if (fromDate) lines.push(`# From: ${fromDate.toISOString()}`);
  if (toDate) lines.push(`# To: ${toDate.toISOString()}`);
  if (internId) lines.push(`# Intern filter: ${internId}`);
  lines.push(`# Total approved: ${totalRows} · Total payable: NGN ${totalNgn.toLocaleString('en-NG')}`);
  for (const t of totals) {
    lines.push(
      `# ${t.internName || '(no name)'} <${t.internEmail}>: ${t.count} approved · NGN ${t.totalNgn.toLocaleString('en-NG')}`,
    );
  }
  lines.push('');

  // CSV header + rows
  lines.push(
    'intern_name,intern_email,product_slug,product_name,submission_id,approved_at,pay_rate_ngn',
  );
  for (const r of rows) {
    lines.push(
      [
        r.internName,
        r.internEmail,
        r.productSlug,
        r.productName,
        r.submissionId,
        r.approvedAt,
        r.payRateNgn,
      ]
        .map(escapeCsvCell)
        .join(','),
    );
  }

  const filenameStamp = new Date().toISOString().slice(0, 10);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set(
    'Content-Disposition',
    `attachment; filename="intern-payroll-${filenameStamp}.csv"`,
  );
  res.send(lines.join('\n'));
}
