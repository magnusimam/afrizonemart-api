import type { Response } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '@/middleware/auth';
import {
  approvePIQ,
  getPIQForAdmin,
  listReviewQueue,
  listSuppliersForAdmin,
  requestPIQChanges,
  updateSupplierAdmin,
} from './admin.service';

const idParam = z.object({ id: z.string().min(1) });
const updateSupplierBody = z.object({
  currentStage: z.coerce.number().int().min(1).max(10).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});

const requestChangesBody = z.object({
  summary: z.string().trim().min(1).max(2000),
  feedback: z.record(z.string().trim().min(1).max(2000)).default({}),
});

export async function adminQueueHandler(_req: AuthedRequest, res: Response): Promise<void> {
  res.json({ items: await listReviewQueue() });
}

export async function adminSuppliersHandler(_req: AuthedRequest, res: Response): Promise<void> {
  res.json({ items: await listSuppliersForAdmin() });
}

export async function adminGetPIQHandler(req: AuthedRequest, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  res.json(await getPIQForAdmin(id));
}

export async function adminUpdateSupplierHandler(req: AuthedRequest, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  const body = updateSupplierBody.parse(req.body);
  res.json(await updateSupplierAdmin(id, body));
}

export async function adminApprovePIQHandler(req: AuthedRequest, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  res.json(await approvePIQ(id));
}

export async function adminRequestChangesHandler(req: AuthedRequest, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  const body = requestChangesBody.parse(req.body);
  res.json(await requestPIQChanges(id, body));
}
