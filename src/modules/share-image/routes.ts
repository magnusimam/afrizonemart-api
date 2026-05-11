import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { shareImageLimiter } from '@/middleware/rate-limit';
import { getCutoutHandler } from './controller';

/**
 * Share-image routes — public, rate-limited.
 *
 * Mounted at /api/share-image. Currently exposes one endpoint, the
 * cutout cache lookup that the storefront's satori route handler
 * calls before composing the share PNG.
 */
export const shareImageRoutes = Router();

shareImageRoutes.get(
  '/cutout/:slug',
  shareImageLimiter,
  asyncHandler(getCutoutHandler),
);
