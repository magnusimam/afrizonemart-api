import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  cancelPayoutDraftHandler,
  createPayoutDraftHandler,
  finalizePayoutHandler,
  getPayoutHandler,
  listPayoutsHandler,
  previewPayoutHandler,
} from './controller';

/// Tracker #50 — admin endpoints for intern image-work payouts.
/// Mounted under /api/admin/intern-payouts via admin router.
///
/// Gating moved to the mount point in admin/routes.ts where it sits
/// with the rest of the per-domain capability checks
/// (`requireCapability('payouts.write')`). ADMIN bypasses that check
/// implicitly; STAFF needs the capability ticked to access these
/// endpoints. Interns (who have `products.image-only`) never get
/// `payouts.write`, so they can't see another contractor's payday —
/// same end result, but cleanly capability-driven instead of
/// role-coupled.
export const adminInternPayoutRoutes = Router();

adminInternPayoutRoutes.get('/', asyncHandler(listPayoutsHandler));
adminInternPayoutRoutes.post('/preview', asyncHandler(previewPayoutHandler));
adminInternPayoutRoutes.post('/', asyncHandler(createPayoutDraftHandler));
adminInternPayoutRoutes.get('/:id', asyncHandler(getPayoutHandler));
adminInternPayoutRoutes.post(
  '/:id/finalize',
  asyncHandler(finalizePayoutHandler),
);
adminInternPayoutRoutes.delete('/:id', asyncHandler(cancelPayoutDraftHandler));
