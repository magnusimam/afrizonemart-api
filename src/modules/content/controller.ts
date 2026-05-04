import type { Request, Response } from 'express';
import { updateContentBatchSchema } from './schema';
import {
  getContentOverrides,
  getRegistry,
  updateContentOverrides,
} from './service';

// ---- Public --------------------------------------------------------

export async function getContentHandler(_req: Request, res: Response): Promise<void> {
  const overrides = await getContentOverrides();
  // Short edge cache — admin saves should land within ~30s. The
  // storefront calls this once per server-render so the volume is low.
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=300');
  res.json({ overrides });
}

// ---- Admin ---------------------------------------------------------

export function adminGetRegistryHandler(_req: Request, res: Response): void {
  res.json(getRegistry());
}

export async function adminGetContentHandler(_req: Request, res: Response): Promise<void> {
  res.json({ overrides: await getContentOverrides() });
}

export async function adminUpdateContentHandler(req: Request, res: Response): Promise<void> {
  const body = updateContentBatchSchema.parse(req.body);
  const user = (req as Request & { user?: { id: string } }).user;
  res.json(await updateContentOverrides(body, user?.id ?? null));
}
