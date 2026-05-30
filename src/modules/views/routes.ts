import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { optionalAuth } from '@/middleware/auth';
import { recordViewHandler } from './controller';

/**
 * Product view tracking routes. Mounted at `/api/views`.
 *
 *   POST /api/views   (optionalAuth)  body: { productSlug, sessionId? }
 *
 * Anonymous and signed-in viewers both count toward trending. The
 * controller swallows errors and returns 204 either way so clients
 * can fire-and-forget.
 */
export const viewRoutes = Router();

viewRoutes.post('/', optionalAuth, asyncHandler(recordViewHandler));
