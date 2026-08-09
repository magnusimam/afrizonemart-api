import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  completeAuditHandler,
  getAuditHandler,
  getTemplateHandler,
  listAuditQueueHandler,
  listTemplatesHandler,
  saveAuditHandler,
} from './admin.audit.controller';

/** Quality & Compliance — mounted at /api/admin/supplier-audits, gated by
 *  requireCapability('suppliers.audit'). */
export const adminSupplierAuditRoutes = Router();

adminSupplierAuditRoutes.get('/', asyncHandler(listAuditQueueHandler));
adminSupplierAuditRoutes.get('/templates', asyncHandler(listTemplatesHandler));
adminSupplierAuditRoutes.get('/templates/:category', asyncHandler(getTemplateHandler));
adminSupplierAuditRoutes.get('/:supplierId', asyncHandler(getAuditHandler));
adminSupplierAuditRoutes.put('/:supplierId', asyncHandler(saveAuditHandler));
adminSupplierAuditRoutes.post('/:supplierId/complete', asyncHandler(completeAuditHandler));
