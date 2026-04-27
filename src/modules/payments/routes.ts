import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireAuth } from '@/middleware/auth';
import {
  checkOrderHandler,
  initPaymentHandler,
  stubCheckoutHandler,
  verifyHandler,
  webhookHandler,
} from './controller';
import { listPublicGateways } from './service';

export const paymentRoutes = Router();

// Public — storefront checkout reads the active gateway list to render
// the payment-method picker. Filters by currency.
paymentRoutes.get(
  '/gateways',
  asyncHandler(async (req: Request, res: Response) => {
    const currency = typeof req.query.currency === 'string' ? req.query.currency : undefined;
    res.json({ items: await listPublicGateways(currency) });
  }),
);

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
