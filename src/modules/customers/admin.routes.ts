import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
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
  adminResendInviteHandler,
  adminUpdateStaffHandler,
} from './admin.staff.controller';

export const adminCustomerRoutes = Router();

adminCustomerRoutes.get('/', asyncHandler(adminListCustomersHandler));
adminCustomerRoutes.get('/:id', asyncHandler(adminGetCustomerHandler));
adminCustomerRoutes.patch('/:id', asyncHandler(adminUpdateCustomerHandler));

export const adminStaffRoutes = Router();

adminStaffRoutes.get('/', asyncHandler(adminListStaffHandler));
adminStaffRoutes.post('/', asyncHandler(adminCreateStaffHandler));
// `/permissions` BEFORE `/:id` so the literal route wins.
adminStaffRoutes.get('/permissions', adminGetPermissionsHandler);
adminStaffRoutes.get('/:id', asyncHandler(adminGetStaffHandler));
adminStaffRoutes.patch('/:id', asyncHandler(adminUpdateStaffHandler));
adminStaffRoutes.delete('/:id', asyncHandler(adminDeleteStaffHandler));
adminStaffRoutes.post('/:id/resend-invite', asyncHandler(adminResendInviteHandler));
