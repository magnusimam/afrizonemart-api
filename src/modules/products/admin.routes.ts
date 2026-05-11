import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminBulkActionHandler,
  adminBulkTemplateHandler,
  adminBulkUploadHandler,
  adminCreateProductHandler,
  adminDeleteProductHandler,
  adminGetProductHandler,
  adminListProductsHandler,
  adminListProductPriceHistoryHandler,
  adminUpdateProductHandler,
  adminUpdateProductPriceHandler,
} from './admin.controller';
import {
  adminListBrandsHandler,
  adminSetBrandLogoHandler,
} from './admin.brands.controller';

export const adminProductRoutes = Router();

adminProductRoutes.get('/', asyncHandler(adminListProductsHandler));
adminProductRoutes.post('/', asyncHandler(adminCreateProductHandler));
adminProductRoutes.post('/bulk-upload', asyncHandler(adminBulkUploadHandler));
adminProductRoutes.post('/bulk', asyncHandler(adminBulkActionHandler));
adminProductRoutes.get('/bulk-template', adminBulkTemplateHandler);
adminProductRoutes.get('/:id', asyncHandler(adminGetProductHandler));
adminProductRoutes.patch('/:id', asyncHandler(adminUpdateProductHandler));
adminProductRoutes.delete('/:id', asyncHandler(adminDeleteProductHandler));
adminProductRoutes.patch(
  '/:id/price',
  asyncHandler(adminUpdateProductPriceHandler),
);
adminProductRoutes.get(
  '/:id/price-history',
  asyncHandler(adminListProductPriceHistoryHandler),
);

/// Brand-scoped admin actions. Brands aren't a first-class entity — they
/// live as a string on Product — but admins need to manage logo coverage
/// across many products at once. Mounted separately at /api/admin/brands.
export const adminBrandRoutes = Router();

adminBrandRoutes.get('/', asyncHandler(adminListBrandsHandler));
adminBrandRoutes.post('/set-logo', asyncHandler(adminSetBrandLogoHandler));
