import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireAuth } from '@/middleware/auth';
import {
  confirmDeliveryByCustomerHandler,
  getDeliveryTokenHandler,
} from '@/modules/courier/controller';
import {
  getOrderHandler,
  listOrdersHandler,
  placeOrderHandler,
} from './controller';

export const orderRoutes = Router();

orderRoutes.use(requireAuth);
orderRoutes.post('/', asyncHandler(placeOrderHandler));
orderRoutes.get('/', asyncHandler(listOrdersHandler));
orderRoutes.get('/:id', asyncHandler(getOrderHandler));
/// Show & Scan delivery confirmation. The customer's app shows the
/// QR / OTP from the token endpoint; the "I received it" button
/// posts to confirm-delivery.
orderRoutes.get('/:id/delivery-token', asyncHandler(getDeliveryTokenHandler));
orderRoutes.post('/:id/confirm-delivery', asyncHandler(confirmDeliveryByCustomerHandler));
