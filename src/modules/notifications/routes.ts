import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { resendWebhookHandler } from './resend-webhook.controller';

/// Tracker #49 — Public notification routes. Resend webhooks land
/// here; the Svix signature in the request headers is the only auth.
export const notificationRoutes = Router();

notificationRoutes.post('/webhooks/resend', asyncHandler(resendWebhookHandler));
