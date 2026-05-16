import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireAuth } from '@/middleware/auth';
import { requireCapability } from '@/middleware/require-capability';
import {
  adjustAccountHandler,
  downgradeAccountHandler,
  getAccountHandler,
  getConfigHandler,
  getOrCreateAccountByUserHandler,
  listAccountsHandler,
  patchConfigHandler,
} from './admin.controller';

/**
 * Admin routes for Continental Rewards.
 *
 * Mounted under /api/admin/loyalty. Read endpoints require
 * `loyalty.read`; mutating endpoints require `loyalty.write`. ADMIN
 * role bypasses the capability check entirely (per the standard
 * pattern in `require-capability.ts`).
 */
export const adminLoyaltyRoutes = Router();

adminLoyaltyRoutes.use(requireAuth);

adminLoyaltyRoutes.get(
  '/config',
  requireCapability('loyalty.read'),
  asyncHandler(getConfigHandler),
);
adminLoyaltyRoutes.patch(
  '/config',
  requireCapability('loyalty.write'),
  asyncHandler(patchConfigHandler),
);

adminLoyaltyRoutes.get(
  '/accounts',
  requireCapability('loyalty.read'),
  asyncHandler(listAccountsHandler),
);
adminLoyaltyRoutes.get(
  '/accounts/:id',
  requireCapability('loyalty.read'),
  asyncHandler(getAccountHandler),
);
adminLoyaltyRoutes.post(
  '/accounts/:id/adjust',
  requireCapability('loyalty.write'),
  asyncHandler(adjustAccountHandler),
);
adminLoyaltyRoutes.post(
  '/accounts/:id/downgrade',
  requireCapability('loyalty.write'),
  asyncHandler(downgradeAccountHandler),
);
adminLoyaltyRoutes.get(
  '/accounts/by-user/:userId',
  requireCapability('loyalty.write'),
  asyncHandler(getOrCreateAccountByUserHandler),
);
