import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminGetCustomerHandler,
  adminListCustomersHandler,
  adminUpdateCustomerHandler,
} from './admin.controller';
import {
  adminCreateStaffHandler,
  adminGetPermissionsHandler,
  adminListStaffHandler,
} from './admin.staff.controller';

export const adminCustomerRoutes = Router();

adminCustomerRoutes.get('/', asyncHandler(adminListCustomersHandler));
adminCustomerRoutes.get('/:id', asyncHandler(adminGetCustomerHandler));
adminCustomerRoutes.patch('/:id', asyncHandler(adminUpdateCustomerHandler));

export const adminStaffRoutes = Router();

adminStaffRoutes.get('/', asyncHandler(adminListStaffHandler));
adminStaffRoutes.post('/', asyncHandler(adminCreateStaffHandler));
adminStaffRoutes.get('/permissions', adminGetPermissionsHandler);
