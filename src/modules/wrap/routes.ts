import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireAuth } from '@/middleware/auth';
import {
  wrapMeHandler,
  wrapSharedHandler,
  wrapShareTokenHandler,
} from './me.controller';

/**
 * Customer-facing wrap routes. Mounted at `/api/wrap`.
 * Admin wrap endpoints live separately under `/api/admin/wrap`.
 */
export const wrapRoutes = Router();

// PUBLIC (token-gated) — must be registered BEFORE the requireAuth
// gate below. Renders share images for an already-live wrap; the
// signed token is the authorisation.
wrapRoutes.get('/shared', asyncHandler(wrapSharedHandler));

// Everything past here is personal → auth required.
wrapRoutes.use(requireAuth);

wrapRoutes.get('/me', asyncHandler(wrapMeHandler));
wrapRoutes.get('/me/share-token', asyncHandler(wrapShareTokenHandler));
