import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { adminSearchStatsHandler } from './admin.controller';

/**
 * Admin search-quality dashboard routes. Mounted at /api/admin/search
 * behind the analytics.read capability gate (see admin/routes.ts).
 *
 *   GET /api/admin/search/stats  ?days=7
 *
 * Phase 0 "p95 < 200ms" / "zero-result rate < 5%" checklist items —
 * see ALGORITHM_SYSTEMS_TRACKER.md.
 */
export const adminSearchRoutes = Router();

adminSearchRoutes.get('/stats', asyncHandler(adminSearchStatsHandler));
