import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  bookProductionHandler,
  cancelProductionHandler,
  completeProductionHandler,
  getProductionHandler,
  listProductionQueueHandler,
} from './admin.production.controller';

/** Take50 production — mounted at /api/admin/supplier-production, gated by
 *  requireCapability('suppliers.production'). */
export const adminSupplierProductionRoutes = Router();

adminSupplierProductionRoutes.get('/', asyncHandler(listProductionQueueHandler));
adminSupplierProductionRoutes.get('/:supplierId', asyncHandler(getProductionHandler));
adminSupplierProductionRoutes.post('/:supplierId/book', asyncHandler(bookProductionHandler));
adminSupplierProductionRoutes.post('/:supplierId/complete', asyncHandler(completeProductionHandler));
adminSupplierProductionRoutes.post('/:supplierId/cancel', asyncHandler(cancelProductionHandler));
