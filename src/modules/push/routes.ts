import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireAuth } from '@/middleware/auth';
import { deleteTokenHandler, registerTokenHandler } from './controller';

/**
 * Customer-facing push token endpoints. Both authed — anonymous
 * users can't receive transactional push (we wouldn't know who
 * they are when the order event fires).
 */
export const pushRoutes = Router();

pushRoutes.use(requireAuth);
pushRoutes.post('/tokens', asyncHandler(registerTokenHandler));
pushRoutes.delete('/tokens/:token', asyncHandler(deleteTokenHandler));
