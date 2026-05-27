import type { Response } from 'express';
import type { AuthedRequest } from '@/middleware/auth';
import { HttpError } from '@/middleware/error-handler';
import { createReviewBodySchema, listReviewsQuerySchema } from './schema';
import {
  createReviewService,
  listReviewsForProductService,
} from './service';

/**
 * Public reviews HTTP layer — zod-parse, call service, JSON respond.
 * Admin moderation handlers live in `admin.controller.ts`.
 */

export async function listReviewsHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const q = listReviewsQuerySchema.parse(req.query);
  res.json(await listReviewsForProductService(q));
}

export async function createReviewHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized('Sign in to leave a review');
  const body = createReviewBodySchema.parse(req.body);
  const review = await createReviewService(req.user.id, body);
  res.status(201).json(review);
}
