import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  listCommentsHandler,
  listReviewCallsHandler,
  scheduleReviewCallHandler,
  updateCommentHandler,
} from './admin.orientation.controller';

/** Orientation & review calls — mounted at /api/admin/orientation, gated by
 *  requireCapability('suppliers.review'). */
export const adminOrientationRoutes = Router();

adminOrientationRoutes.get('/comments', asyncHandler(listCommentsHandler));
adminOrientationRoutes.patch('/comments/:id', asyncHandler(updateCommentHandler));
adminOrientationRoutes.get('/review-calls', asyncHandler(listReviewCallsHandler));
adminOrientationRoutes.post('/review-calls/:supplierId/schedule', asyncHandler(scheduleReviewCallHandler));
