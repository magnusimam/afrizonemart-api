import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireAuth } from '@/middleware/auth';
import {
  getMyLoyaltyHandler,
  getRefereeCouponHandler,
  getReferralSummaryHandler,
} from './controller';

/**
 * Customer-facing loyalty routes. Admin routes are in
 * `admin.routes.ts` under `/api/admin/loyalty`.
 */
export const loyaltyRoutes = Router();

loyaltyRoutes.use(requireAuth);
loyaltyRoutes.get('/me', asyncHandler(getMyLoyaltyHandler));
loyaltyRoutes.get('/referral-summary', asyncHandler(getReferralSummaryHandler));
loyaltyRoutes.get('/referral-coupon', asyncHandler(getRefereeCouponHandler));
