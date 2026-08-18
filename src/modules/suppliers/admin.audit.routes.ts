import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  authoriseAuditHandler,
  completeAuditHandler,
  getAuditHandler,
  getTemplateHandler,
  issueChecklistHandler,
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
/** Resolves which checkpoints apply to this supplier's product, and freezes it. */
adminSupplierAuditRoutes.post('/:supplierId/checklist', asyncHandler(issueChecklistHandler));
adminSupplierAuditRoutes.post('/:supplierId/complete', asyncHandler(completeAuditHandler));
/** The human review gate — releases the report to the supplier. */
adminSupplierAuditRoutes.post('/:supplierId/authorise', asyncHandler(authoriseAuditHandler));
