import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminProductViewsHandler,
  adminTopProductsHandler,
} from './admin.controller';

/**
 * Admin views dashboard routes. Mounted at /api/admin/views behind
 * the analytics.read capability gate (see admin/routes.ts).
 *
 *   GET /api/admin/views/top-products   ?days=7&limit=50&offset=0
 *   GET /api/admin/views/product/:slug  ?days=30
 *
 * Per-user "recently viewed" drill (GET /api/admin/views/user/:id)
 * is a follow-up — the top-products + per-product views already
 * answer the headline questions.
 */
export const adminViewRoutes = Router();

adminViewRoutes.get('/top-products', asyncHandler(adminTopProductsHandler));
adminViewRoutes.get(
  '/product/:slug',
  asyncHandler(adminProductViewsHandler),
);
