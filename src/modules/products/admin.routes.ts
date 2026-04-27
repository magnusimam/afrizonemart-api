import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminBulkTemplateHandler,
  adminBulkUploadHandler,
  adminCreateProductHandler,
  adminDeleteProductHandler,
  adminGetProductHandler,
  adminListProductsHandler,
  adminUpdateProductHandler,
} from './admin.controller';

export const adminProductRoutes = Router();

adminProductRoutes.get('/', asyncHandler(adminListProductsHandler));
adminProductRoutes.post('/', asyncHandler(adminCreateProductHandler));
adminProductRoutes.post('/bulk-upload', asyncHandler(adminBulkUploadHandler));
adminProductRoutes.get('/bulk-template', adminBulkTemplateHandler);
adminProductRoutes.get('/:id', asyncHandler(adminGetProductHandler));
adminProductRoutes.patch('/:id', asyncHandler(adminUpdateProductHandler));
adminProductRoutes.delete('/:id', asyncHandler(adminDeleteProductHandler));
