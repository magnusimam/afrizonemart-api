import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireCapability } from '@/middleware/require-capability';
import {
  adminAddNoteHandler,
  adminGetOrderHandler,
  adminListOrdersHandler,
  adminRecordRefundHandler,
  adminUpdateStatusHandler,
} from './admin.controller';

// Phase 11.3 (audit H1 follow-up): the parent composer gates this
// sub-router on `orders.read` (the most permissive). Mutating
// endpoints get tighter inline checks so a read-only STAFF can't
// perform writes, and refund actions require their own capability.
export const adminOrderRoutes = Router();

adminOrderRoutes.get('/', asyncHandler(adminListOrdersHandler));
adminOrderRoutes.get('/:id', asyncHandler(adminGetOrderHandler));
adminOrderRoutes.patch(
  '/:id/status',
  requireCapability('orders.write'),
  asyncHandler(adminUpdateStatusHandler),
);
adminOrderRoutes.post(
  '/:id/notes',
  requireCapability('orders.write'),
  asyncHandler(adminAddNoteHandler),
);
adminOrderRoutes.post(
  '/:id/refunds',
  requireCapability('orders.refund'),
  asyncHandler(adminRecordRefundHandler),
);
