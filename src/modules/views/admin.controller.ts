import type { Response } from 'express';
import type { AuthedRequest } from '@/middleware/auth';
import {
  productViewsParamSchema,
  productViewsQuerySchema,
  topProductsQuerySchema,
} from './admin.schema';
import {
  getProductViewsService,
  getTopProductsService,
} from './admin.service';

/**
 * Admin views dashboard HTTP layer. Mounted at /api/admin/views
 * behind the analytics.read capability gate.
 */

export async function adminTopProductsHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const q = topProductsQuerySchema.parse(req.query);
  res.json(await getTopProductsService(q));
}

export async function adminProductViewsHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const { slug } = productViewsParamSchema.parse(req.params);
  const q = productViewsQuerySchema.parse(req.query);
  res.json(await getProductViewsService(slug, q));
}
