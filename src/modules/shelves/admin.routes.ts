import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminListShelvesHandler,
  adminGetShelfHandler,
  adminUpdateShelfHandler,
  adminSetShelfProductsHandler,
} from './controller';

export const adminShelfRoutes = Router();

adminShelfRoutes.get('/', asyncHandler(adminListShelvesHandler));
adminShelfRoutes.get('/:key', asyncHandler(adminGetShelfHandler));
adminShelfRoutes.put('/:key', asyncHandler(adminUpdateShelfHandler));
adminShelfRoutes.put('/:key/products', asyncHandler(adminSetShelfProductsHandler));
