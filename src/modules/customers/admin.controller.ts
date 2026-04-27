import type { Response } from 'express';
import type { AuthedRequest } from '@/middleware/auth';
import { HttpError } from '@/middleware/error-handler';
import {
  adminCustomerListQuerySchema,
  updateCustomerBodySchema,
} from './admin.schema';
import {
  adminGetCustomer,
  adminListCustomers,
  adminUpdateCustomer,
} from './admin.service';

function actorOr401(req: AuthedRequest): string {
  if (!req.user) throw HttpError.unauthorized();
  return req.user.id;
}

function idOr400(req: AuthedRequest): string {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing customer id');
  return id;
}

export async function adminListCustomersHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const query = adminCustomerListQuerySchema.parse(req.query);
  res.json(await adminListCustomers(query));
}

export async function adminGetCustomerHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  res.json(await adminGetCustomer(idOr400(req)));
}

export async function adminUpdateCustomerHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const body = updateCustomerBodySchema.parse(req.body);
  res.json(await adminUpdateCustomer(idOr400(req), body, actorOr401(req)));
}
