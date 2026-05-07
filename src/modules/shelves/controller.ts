import type { Request, Response } from 'express';
import {
  shelfKeyParamSchema,
  shelfPublicQuerySchema,
  adminUpdateShelfSchema,
  adminSetShelfProductsSchema,
} from './schema';
import {
  readShelf,
  adminListShelves,
  adminGetShelf,
  adminUpdateShelf,
  adminSetShelfProducts,
} from './service';

/**
 * HTTP layer for the Shelves module.
 *
 * Mirrors the pattern from `products/controller.ts` — zod parse, call
 * the service, JSON respond. No Prisma access here, no business logic.
 */

export async function publicReadShelfHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { key } = shelfKeyParamSchema.parse(req.params);
  const { country } = shelfPublicQuerySchema.parse(req.query);
  const result = await readShelf(key, country);
  res.json(result);
}

// ---- Admin

export async function adminListShelvesHandler(
  _req: Request,
  res: Response,
): Promise<void> {
  res.json(await adminListShelves());
}

export async function adminGetShelfHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { key } = shelfKeyParamSchema.parse(req.params);
  res.json(await adminGetShelf(key));
}

export async function adminUpdateShelfHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { key } = shelfKeyParamSchema.parse(req.params);
  const input = adminUpdateShelfSchema.parse(req.body);
  res.json(await adminUpdateShelf(key, input));
}

export async function adminSetShelfProductsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { key } = shelfKeyParamSchema.parse(req.params);
  const input = adminSetShelfProductsSchema.parse(req.body);
  res.json(await adminSetShelfProducts(key, input));
}
