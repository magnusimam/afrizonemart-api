import type { Request, Response } from 'express';
import {
  listProductsQuerySchema,
  productSlugParamSchema,
} from './product.schema';
import { getProductBySlug, listProducts } from './service';
import type { AuthedRequest } from '@/middleware/auth';

/**
 * HTTP layer for the Products module (Rule B1 — API-First).
 *
 * Validates input with Zod, calls the service, returns JSON. No business
 * logic and no Prisma calls happen in this file.
 */

export async function listProductsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const query = listProductsQuerySchema.parse(req.query);
  const result = await listProducts(query);
  res.json(result);
}

export async function getProductHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const { slug } = productSlugParamSchema.parse(req.params);
  const product = await getProductBySlug(slug, req.user?.id);
  res.json(product);
}
