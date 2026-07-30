import type { Request, Response } from 'express';
import { HttpError } from '@/middleware/error-handler';
import {
  listDocumentSubmissionsQuerySchema,
  patchDocumentSubmissionBodySchema,
  reviewDocumentSubmissionBodySchema,
  upsertDocumentSubmissionBodySchema,
} from './schema';
import {
  createDocumentSubmission,
  getMyDocumentSubmission,
  getDocumentSubmissionForReview,
  listMyDocumentSubmissions,
  listDocumentSubmissionsForReview,
  reviewDocumentSubmission,
  updateDocumentSubmission,
} from './service';

type AuthedReq = Request & { user?: { id: string } };

function userIdOr401(req: Request): string {
  const id = (req as AuthedReq).user?.id;
  if (!id) throw HttpError.unauthorized();
  return id;
}

// ---- Intern endpoints (gated by documents.submit) -------------------

export async function createSubmissionHandler(req: Request, res: Response): Promise<void> {
  const body = upsertDocumentSubmissionBodySchema.parse(req.body);
  res.status(201).json(await createDocumentSubmission(userIdOr401(req), body));
}

export async function updateSubmissionHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing submission id');
  const body = patchDocumentSubmissionBodySchema.parse(req.body);
  res.json(await updateDocumentSubmission(userIdOr401(req), id, body));
}

export async function listMySubmissionsHandler(req: Request, res: Response): Promise<void> {
  res.json(await listMyDocumentSubmissions(userIdOr401(req)));
}

export async function getMySubmissionHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing submission id');
  res.json(await getMyDocumentSubmission(userIdOr401(req), id));
}

// ---- Admin / reviewer endpoints (gated by intern.review) -----------

export async function adminListSubmissionsHandler(req: Request, res: Response): Promise<void> {
  const q = listDocumentSubmissionsQuerySchema.parse(req.query);
  res.json(await listDocumentSubmissionsForReview(q));
}

export async function adminGetSubmissionHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing submission id');
  res.json(await getDocumentSubmissionForReview(id));
}

export async function adminReviewSubmissionHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing submission id');
  const body = reviewDocumentSubmissionBodySchema.parse(req.body);
  res.json(await reviewDocumentSubmission(id, body, userIdOr401(req)));
}
