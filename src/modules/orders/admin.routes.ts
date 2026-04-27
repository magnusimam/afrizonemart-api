import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminAddNoteHandler,
  adminGetOrderHandler,
  adminListOrdersHandler,
  adminRecordRefundHandler,
  adminUpdateStatusHandler,
} from './admin.controller';

export const adminOrderRoutes = Router();

adminOrderRoutes.get('/', asyncHandler(adminListOrdersHandler));
adminOrderRoutes.get('/:id', asyncHandler(adminGetOrderHandler));
adminOrderRoutes.patch('/:id/status', asyncHandler(adminUpdateStatusHandler));
adminOrderRoutes.post('/:id/notes', asyncHandler(adminAddNoteHandler));
adminOrderRoutes.post('/:id/refunds', asyncHandler(adminRecordRefundHandler));
