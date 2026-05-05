import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireAuth } from '@/middleware/auth';
import { requireSupplier } from '@/middleware/require-supplier';
import { getMyProfileHandler, updateMyProfileHandler } from './controller';

/// Supplier-facing routes mounted at /api/suppliers. Every route below
/// is gated by requireSupplier so req.supplierId is set before any
/// handler runs. Admin tooling that needs to view/edit any supplier's
/// data lives under /api/admin/suppliers (separate router, separate
/// gate).
export const supplierRoutes = Router();

supplierRoutes.use(requireAuth, requireSupplier);

supplierRoutes.get('/me', asyncHandler(getMyProfileHandler));
supplierRoutes.patch('/me', asyncHandler(updateMyProfileHandler));
