import type { Request, Response } from 'express';
import { z } from 'zod';
import { HttpError } from '@/middleware/error-handler';
import type { SupplierAuthedRequest } from '@/middleware/require-supplier';
import { getSupplierMe, updateSupplierMe } from './service';

export async function getMyProfileHandler(req: Request, res: Response): Promise<void> {
  const supplierId = (req as SupplierAuthedRequest).supplierId;
  if (!supplierId) throw HttpError.forbidden('Supplier profile not loaded');
  res.json(await getSupplierMe(supplierId));
}

const patchBody = z.object({
  companyName: z.string().trim().max(160).nullable().optional(),
  contactName: z.string().trim().max(120).nullable().optional(),
  contactPhone: z.string().trim().max(40).nullable().optional(),
  country: z.string().trim().length(2).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
});

export async function updateMyProfileHandler(req: Request, res: Response): Promise<void> {
  const supplierId = (req as SupplierAuthedRequest).supplierId;
  if (!supplierId) throw HttpError.forbidden('Supplier profile not loaded');
  const parsed = patchBody.safeParse(req.body);
  if (!parsed.success) {
    throw HttpError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid body');
  }
  res.json(await updateSupplierMe(supplierId, parsed.data));
}
