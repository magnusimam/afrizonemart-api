import type { Response } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '@/middleware/auth';
import { HttpError } from '@/middleware/error-handler';
import {
  bookProduction,
  cancelProduction,
  completeProduction,
  getProduction,
  listProductionQueue,
} from './admin.production.service';

const idParam = z.object({ supplierId: z.string().min(1) });

const bookBodySchema = z.object({
  scheduledAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  location: z.string().trim().max(300).optional(),
  contactName: z.string().trim().max(120).optional(),
  contactPhone: z.string().trim().max(40).optional(),
  productList: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function listProductionQueueHandler(_req: AuthedRequest, res: Response): Promise<void> {
  res.json({ items: await listProductionQueue() });
}

export async function getProductionHandler(req: AuthedRequest, res: Response): Promise<void> {
  const { supplierId } = idParam.parse(req.params);
  res.json(await getProduction(supplierId));
}

export async function bookProductionHandler(req: AuthedRequest, res: Response): Promise<void> {
  const { supplierId } = idParam.parse(req.params);
  const body = bookBodySchema.parse(req.body);
  if (!req.user) throw HttpError.unauthorized('Sign in to book a shoot.');
  res.json(await bookProduction(supplierId, body, req.user.id));
}

export async function completeProductionHandler(req: AuthedRequest, res: Response): Promise<void> {
  const { supplierId } = idParam.parse(req.params);
  res.json(await completeProduction(supplierId));
}

export async function cancelProductionHandler(req: AuthedRequest, res: Response): Promise<void> {
  const { supplierId } = idParam.parse(req.params);
  res.json(await cancelProduction(supplierId));
}
