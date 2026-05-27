import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireAuth } from '@/middleware/auth';
import { createReviewHandler, listReviewsHandler } from './controller';

/**
 * Public reviews routes. GET lists reviews for a product (paginated,
 * verified-first ordering); POST creates one and is gated by
 * requireAuth — guest reviews are deliberately disallowed to cut spam.
 *
 * Mounted at `/api/reviews` in server.ts.
 */
export const reviewRoutes = Router();

reviewRoutes.get('/', asyncHandler(listReviewsHandler));
reviewRoutes.post('/', requireAuth, asyncHandler(createReviewHandler));
