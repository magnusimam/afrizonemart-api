import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireAuth } from '@/middleware/auth';
import { wrapMeHandler } from './me.controller';

/**
 * Customer-facing wrap routes. Mounted at `/api/wrap`.
 * All gated behind requireAuth — a wrap is always personal.
 * Admin wrap endpoints live separately under `/api/admin/wrap`.
 */
export const wrapRoutes = Router();

wrapRoutes.use(requireAuth);

wrapRoutes.get('/me', asyncHandler(wrapMeHandler));
