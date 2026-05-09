import type { Response } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '@/middleware/auth';
import { HttpError } from '@/middleware/error-handler';
import {
  addToWishlist,
  countWishlist,
  listWishlist,
  removeFromWishlist,
} from './service';

const productIdParam = z.object({ productId: z.string().min(1) });
const addBody = z.object({ productId: z.string().min(1) }).strict();

export async function listWishlistHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const items = await listWishlist(req.user.id);
  res.json({ items });
}

export async function countWishlistHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const count = await countWishlist(req.user.id);
  res.json({ count });
}

export async function addWishlistHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const { productId } = addBody.parse(req.body);
  const item = await addToWishlist(req.user.id, productId);
  res.status(201).json(item);
}

export async function removeWishlistHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const { productId } = productIdParam.parse(req.params);
  await removeFromWishlist(req.user.id, productId);
  res.status(204).end();
}
