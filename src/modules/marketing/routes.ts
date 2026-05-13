import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { unsubscribeHandler } from './controller';

/// Tracker #48 — public marketing endpoints. The unsubscribe link
/// must work without a login (the customer who clicks it might not
/// even be on the device they used to register), so this router
/// stays outside the auth middleware. The signed-token check
/// inside applyUnsubscribe is what gates access.
export const marketingRoutes = Router();

marketingRoutes.get('/unsubscribe', asyncHandler(unsubscribeHandler));
marketingRoutes.post('/unsubscribe', asyncHandler(unsubscribeHandler));
