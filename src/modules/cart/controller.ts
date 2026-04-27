import type { Response } from 'express';
import type { AuthedRequest } from '@/middleware/auth';
import { HttpError } from '@/middleware/error-handler';
import { applyCouponBodySchema, replaceCartBodySchema } from './cart.schema';
import {
  applyCouponToCart,
  clearCart,
  getCart,
  removeCouponFromCart,
  replaceCart,
} from './service';

function userIdOr401(req: AuthedRequest): string {
  if (!req.user) throw HttpError.unauthorized();
  return req.user.id;
}

export async function getCartHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  res.json(await getCart(userIdOr401(req)));
}

export async function putCartHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const body = replaceCartBodySchema.parse(req.body);
  res.json(await replaceCart(userIdOr401(req), body));
}

export async function deleteCartHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  res.json(await clearCart(userIdOr401(req)));
}

export async function applyCouponHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const body = applyCouponBodySchema.parse(req.body);
  res.json(await applyCouponToCart(userIdOr401(req), body.code));
}

export async function removeCouponHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  res.json(await removeCouponFromCart(userIdOr401(req)));
}
