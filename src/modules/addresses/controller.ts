import type { Response } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '@/middleware/auth';
import { HttpError } from '@/middleware/error-handler';
import {
  partialAddressBodySchema,
  upsertAddressBodySchema,
} from './schema';
import {
  createAddress,
  deleteAddress,
  listAddresses,
  updateAddress,
} from './service';

const idParam = z.object({ id: z.string().min(1) });

export async function listAddressesHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const items = await listAddresses(req.user.id);
  res.json({ items });
}

export async function createAddressHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const body = upsertAddressBodySchema.parse(req.body);
  const address = await createAddress(req.user.id, body);
  res.status(201).json(address);
}

export async function updateAddressHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const { id } = idParam.parse(req.params);
  const body = partialAddressBodySchema.parse(req.body);
  const address = await updateAddress(req.user.id, id, body);
  res.json(address);
}

export async function deleteAddressHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const { id } = idParam.parse(req.params);
  await deleteAddress(req.user.id, id);
  res.status(204).end();
}
