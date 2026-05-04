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
  getInternProgress,
  getInternQueue,
  listSubmissionsForReview,
  reassign,
  reviewSubmission,
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
