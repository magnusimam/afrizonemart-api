import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireAuth } from '@/middleware/auth';
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
