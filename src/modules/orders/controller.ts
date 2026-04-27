import type { Response } from 'express';
import type { AuthedRequest } from '@/middleware/auth';
import { HttpError } from '@/middleware/error-handler';
import { placeOrderBodySchema } from './order.schema';
import { getOrder, listOrders, placeOrder } from './service';

function userIdOr401(req: AuthedRequest): string {
  if (!req.user) throw HttpError.unauthorized();
  return req.user.id;
}

export async function placeOrderHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const body = placeOrderBodySchema.parse(req.body);
  const order = await placeOrder(userIdOr401(req), body);
  res.status(201).json(order);
}

export async function listOrdersHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  res.json({ items: await listOrders(userIdOr401(req)) });
}

export async function getOrderHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing order id');
  res.json(await getOrder(userIdOr401(req), id));
}
