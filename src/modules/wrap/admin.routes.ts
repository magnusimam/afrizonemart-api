import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminBackfillWrapsHandler,
  adminMockPreviewWrapHandler,
  adminPreviewWrapHandler,
  adminPublishWrapsHandler,
  adminRecomputeWrapHandler,
  adminToggleWrapVisibilityHandler,
  adminWrapStatsHandler,
} from './admin.controller';

/**
 * Admin-only wrap endpoints. Mounted under `/api/admin/wrap`.
 * Admin auth + content.write capability are enforced at the
 * parent admin router level — see admin/routes.ts.
 */
export const adminWrapRoutes = Router();

adminWrapRoutes.get('/stats', asyncHandler(adminWrapStatsHandler));
adminWrapRoutes.get('/preview', asyncHandler(adminPreviewWrapHandler));
adminWrapRoutes.post('/mock-preview', asyncHandler(adminMockPreviewWrapHandler));
adminWrapRoutes.post('/recompute', asyncHandler(adminRecomputeWrapHandler));
adminWrapRoutes.post('/publish', asyncHandler(adminPublishWrapsHandler));
adminWrapRoutes.post('/backfill', asyncHandler(adminBackfillWrapsHandler));
adminWrapRoutes.patch('/:id', asyncHandler(adminToggleWrapVisibilityHandler));
