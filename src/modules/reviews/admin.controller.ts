import type { Request, Response } from 'express';
import { HttpError } from '@/middleware/error-handler';
import {
  adminReviewListQuerySchema,
  updateReviewBodySchema,
} from './admin.schema';
import {
  adminDeleteReview,
  adminListReviews,
  adminUpdateReview,
} from './admin.service';

export async function adminListReviewsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const query = adminReviewListQuerySchema.parse(req.query);
  res.json(await adminListReviews(query));
}

export async function adminUpdateReviewHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing review id');
  const body = updateReviewBodySchema.parse(req.body);
  res.json(await adminUpdateReview(id, body));
}

export async function adminDeleteReviewHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing review id');
  await adminDeleteReview(id);
  res.status(204).end();
}
