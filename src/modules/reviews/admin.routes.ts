import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminDeleteReviewHandler,
  adminListReviewsHandler,
  adminUpdateReviewHandler,
} from './admin.controller';

export const adminReviewRoutes = Router();

adminReviewRoutes.get('/', asyncHandler(adminListReviewsHandler));
adminReviewRoutes.patch('/:id', asyncHandler(adminUpdateReviewHandler));
adminReviewRoutes.delete('/:id', asyncHandler(adminDeleteReviewHandler));
