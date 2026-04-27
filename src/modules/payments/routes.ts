import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireAuth } from '@/middleware/auth';
import {
  checkOrderHandler,
  initPaymentHandler,
  stubCheckoutHandler,
  verifyHandler,
  webhookHandler,
} from './controller';

export const paymentRoutes = Router();

paymentRoutes.post('/init', requireAuth, asyncHandler(initPaymentHandler));
paymentRoutes.get('/verify/:reference', requireAuth, asyncHandler(verifyHandler));
// Polling helper used by the success page when the webhook URL isn't
// pointed at our server yet (or is delayed). Looks up the latest
// payment for the order and asks the gateway to confirm.
paymentRoutes.post('/check-order/:orderRef', requireAuth, asyncHandler(checkOrderHandler));
// Public — webhook endpoint for the gateway. Auth by signature, not bearer.
paymentRoutes.post('/webhook', asyncHandler(webhookHandler));
// Dev-only stub-checkout HTML page. Safe to leave mounted in prod since
// it does nothing useful unless a stub gatewayRef is passed.
paymentRoutes.get('/stub-checkout/:ref', stubCheckoutHandler);
