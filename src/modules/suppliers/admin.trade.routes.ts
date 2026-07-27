import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  cancelPurchaseOrderHandler,
  issuePurchaseOrderHandler,
  listListingsHandler,
  listPurchaseOrdersHandler,
  publishListingHandler,
} from './admin.trade.controller';

/** Activation & Procurement — mounted at /api/admin/trade, gated by
 *  requireCapability('suppliers.trade'). */
export const adminTradeRoutes = Router();

adminTradeRoutes.get('/listings', asyncHandler(listListingsHandler));
adminTradeRoutes.post('/listings/:supplierId/publish', asyncHandler(publishListingHandler));
adminTradeRoutes.get('/purchase-orders', asyncHandler(listPurchaseOrdersHandler));
adminTradeRoutes.post('/purchase-orders/:supplierId', asyncHandler(issuePurchaseOrderHandler));
adminTradeRoutes.post('/purchase-orders/:id/cancel', asyncHandler(cancelPurchaseOrderHandler));
