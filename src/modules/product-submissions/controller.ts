import type { Request, Response } from 'express';
import { HttpError } from '@/middleware/error-handler';
import {
  listProductSubmissionsQuerySchema,
  patchProductSubmissionBodySchema,
  reviewProductSubmissionBodySchema,
  upsertProductSubmissionBodySchema,
} from './schema';
import {
  createProductSubmission,
  getMyProductSubmission,
  getProductSubmissionForReview,
  listMyProductSubmissions,
  listProductSubmissionsForReview,
  reviewProductSubmission,
  updateProductSubmission,
} from './service';

type AuthedReq = Request & { user?: { id: string } };

function userIdOr401(req: Request): string {
  const id = (req as AuthedReq).user?.id;
  if (!id) throw HttpError.unauthorized();
  return id;
}

// ---- Intern endpoints (gated by products.submit) -------------------

export async function createSubmissionHandler(req: Request, res: Response): Promise<void> {
  const body = upsertProductSubmissionBodySchema.parse(req.body);
  res.status(201).json(await createProductSubmission(userIdOr401(req), body));
}

export async function updateSubmissionHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing submission id');
  const body = patchProductSubmissionBodySchema.parse(req.body);
  res.json(await updateProductSubmission(userIdOr401(req), id, body));
}

export async function listMySubmissionsHandler(req: Request, res: Response): Promise<void> {
  res.json(await listMyProductSubmissions(userIdOr401(req)));
}

export async function getMySubmissionHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing submission id');
  res.json(await getMyProductSubmission(userIdOr401(req), id));
}

// ---- Admin / reviewer endpoints (gated by intern.review) -----------

export async function adminListSubmissionsHandler(req: Request, res: Response): Promise<void> {
  const q = listProductSubmissionsQuerySchema.parse(req.query);
  res.json(await listProductSubmissionsForReview(q));
}

export async function adminGetSubmissionHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing submission id');
  res.json(await getProductSubmissionForReview(id));
}

export async function adminReviewSubmissionHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing submission id');
  const body = reviewProductSubmissionBodySchema.parse(req.body);
  res.json(await reviewProductSubmission(id, body, userIdOr401(req)));
}
