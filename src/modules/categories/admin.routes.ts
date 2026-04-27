import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminCreateCategoryHandler,
  adminDeleteCategoryHandler,
  adminListCategoriesHandler,
  adminUpdateCategoryHandler,
} from './admin.controller';

export const adminCategoryRoutes = Router();

adminCategoryRoutes.get('/', asyncHandler(adminListCategoriesHandler));
adminCategoryRoutes.post('/', asyncHandler(adminCreateCategoryHandler));
adminCategoryRoutes.patch('/:id', asyncHandler(adminUpdateCategoryHandler));
adminCategoryRoutes.delete('/:id', asyncHandler(adminDeleteCategoryHandler));
