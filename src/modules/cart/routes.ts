import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireAuth } from '@/middleware/auth';
import {
  applyCouponHandler,
  deleteCartHandler,
  getCartHandler,
  putCartHandler,
  removeCouponHandler,
} from './controller';

export const cartRoutes = Router();

cartRoutes.use(requireAuth);
cartRoutes.get('/', asyncHandler(getCartHandler));
cartRoutes.put('/', asyncHandler(putCartHandler));
cartRoutes.delete('/', asyncHandler(deleteCartHandler));
cartRoutes.post('/coupon', asyncHandler(applyCouponHandler));
cartRoutes.delete('/coupon', asyncHandler(removeCouponHandler));
