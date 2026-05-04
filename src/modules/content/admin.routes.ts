import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminGetContentHandler,
  adminGetRegistryHandler,
  adminUpdateContentHandler,
} from './controller';

export const adminContentRoutes = Router();

adminContentRoutes.get('/registry', adminGetRegistryHandler);
adminContentRoutes.get('/', asyncHandler(adminGetContentHandler));
adminContentRoutes.put('/', asyncHandler(adminUpdateContentHandler));
