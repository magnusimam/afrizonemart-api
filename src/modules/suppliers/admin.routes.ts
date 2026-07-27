import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminApprovePIQHandler,
  adminGetPIQHandler,
  adminQueueHandler,
  adminRequestChangesHandler,
  adminSuppliersHandler,
  adminUpdateSupplierHandler,
} from './admin.controller';

/**
 * Admin supplier review — mounted at /api/admin/suppliers and gated by
 * requireCapability('suppliers.review') in the admin router.
 */
export const adminSupplierRoutes = Router();

adminSupplierRoutes.get('/', asyncHandler(adminSuppliersHandler));
adminSupplierRoutes.get('/queue', asyncHandler(adminQueueHandler));
adminSupplierRoutes.get('/piqs/:id', asyncHandler(adminGetPIQHandler));
adminSupplierRoutes.post('/piqs/:id/approve', asyncHandler(adminApprovePIQHandler));
adminSupplierRoutes.post('/piqs/:id/request-changes', asyncHandler(adminRequestChangesHandler));
adminSupplierRoutes.patch('/:id', asyncHandler(adminUpdateSupplierHandler));
