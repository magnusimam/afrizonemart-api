import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireRole } from '@/middleware/require-role';
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
/// ADMIN-only — never lets an intern see another contractor's payday.
export const adminInternPayoutRoutes = Router();

adminInternPayoutRoutes.use(requireRole('ADMIN'));

adminInternPayoutRoutes.get('/', asyncHandler(listPayoutsHandler));
adminInternPayoutRoutes.post('/preview', asyncHandler(previewPayoutHandler));
adminInternPayoutRoutes.post('/', asyncHandler(createPayoutDraftHandler));
adminInternPayoutRoutes.get('/:id', asyncHandler(getPayoutHandler));
adminInternPayoutRoutes.post(
  '/:id/finalize',
  asyncHandler(finalizePayoutHandler),
);
adminInternPayoutRoutes.delete('/:id', asyncHandler(cancelPayoutDraftHandler));
