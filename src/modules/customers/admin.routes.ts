import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireCapability } from '@/middleware/require-capability';
import {
  adminGetCustomerHandler,
  adminListCustomersHandler,
  adminUpdateCustomerHandler,
} from './admin.controller';
import {
  adminCreateStaffHandler,
  adminDeleteStaffHandler,
  adminGetPermissionsHandler,
  adminGetStaffHandler,
  adminListStaffHandler,
  adminUpdateStaffHandler,
} from './admin.staff.controller';

// Phase 11.3 (audit H1 follow-up): parent composer gates this
// sub-router on `customers.read`. The PATCH endpoint takes a tighter
// inline `customers.write` so a read-only STAFF can't mutate
// customer profiles.
export const adminCustomerRoutes = Router();

adminCustomerRoutes.get('/', asyncHandler(adminListCustomersHandler));
adminCustomerRoutes.get('/:id', asyncHandler(adminGetCustomerHandler));
adminCustomerRoutes.patch(
  '/:id',
  requireCapability('customers.write'),
  asyncHandler(adminUpdateCustomerHandler),
);

export const adminStaffRoutes = Router();

adminStaffRoutes.get('/', asyncHandler(adminListStaffHandler));
adminStaffRoutes.post('/', asyncHandler(adminCreateStaffHandler));
// `/permissions` BEFORE `/:id` so the literal route wins.
adminStaffRoutes.get('/permissions', adminGetPermissionsHandler);
adminStaffRoutes.get('/:id', asyncHandler(adminGetStaffHandler));
adminStaffRoutes.patch('/:id', asyncHandler(adminUpdateStaffHandler));
adminStaffRoutes.delete('/:id', asyncHandler(adminDeleteStaffHandler));
