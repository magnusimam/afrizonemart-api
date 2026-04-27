import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminCreateCouponHandler,
  adminDeleteCouponHandler,
  adminGetCouponHandler,
  adminListCouponsHandler,
  adminUpdateCouponHandler,
} from './admin.controller';

export const adminCouponRoutes = Router();

adminCouponRoutes.get('/', asyncHandler(adminListCouponsHandler));
adminCouponRoutes.post('/', asyncHandler(adminCreateCouponHandler));
adminCouponRoutes.get('/:id', asyncHandler(adminGetCouponHandler));
adminCouponRoutes.patch('/:id', asyncHandler(adminUpdateCouponHandler));
adminCouponRoutes.delete('/:id', asyncHandler(adminDeleteCouponHandler));
