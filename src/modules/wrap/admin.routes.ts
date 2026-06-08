import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminPreviewWrapHandler,
  adminPublishWrapsHandler,
  adminRecomputeWrapHandler,
  adminToggleWrapVisibilityHandler,
} from './admin.controller';

/**
 * Admin-only wrap endpoints. Mounted under `/api/admin/wrap`.
 * Admin auth + content.write capability are enforced at the
 * parent admin router level — see admin/routes.ts.
 */
export const adminWrapRoutes = Router();

adminWrapRoutes.get('/preview', asyncHandler(adminPreviewWrapHandler));
adminWrapRoutes.post('/recompute', asyncHandler(adminRecomputeWrapHandler));
adminWrapRoutes.post('/publish', asyncHandler(adminPublishWrapsHandler));
adminWrapRoutes.patch('/:id', asyncHandler(adminToggleWrapVisibilityHandler));
