import type { Request, Response } from 'express';
import { z } from 'zod';
import { HttpError } from '@/middleware/error-handler';
import { listBrands, setBrandLogo } from './admin.brands.service';

export async function adminListBrandsHandler(_req: Request, res: Response): Promise<void> {
  res.json({ items: await listBrands() });
}

const setLogoBody = z.object({
  brand: z.string().min(0).max(120),
  brandImageUrl: z.string().url(),
  brandImageAlt: z.string().trim().max(200).nullable().optional(),
});

export async function adminSetBrandLogoHandler(req: Request, res: Response): Promise<void> {
  const parsed = setLogoBody.safeParse(req.body);
  if (!parsed.success) {
    throw HttpError.badRequest(parsed.error.issues[0]?.message ?? 'Invalid body');
  }
  res.json(await setBrandLogo(parsed.data));
}
