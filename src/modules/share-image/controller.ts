import type { Request, Response } from 'express';
import { z } from 'zod';
import { getOrCreateCutoutForSlug } from './service';

const slugParam = z.object({ slug: z.string().min(1).max(200) });

/**
 * GET /api/share-image/cutout/:slug
 *
 * Returns a JSON payload with the cached (or freshly generated)
 * cutout URL for the product. Public — no auth required, sharing is
 * meant to be friction-free. Rate-limited at the route layer to
 * deter cold-cache flooding.
 */
export async function getCutoutHandler(req: Request, res: Response): Promise<void> {
  const { slug } = slugParam.parse(req.params);
  const result = await getOrCreateCutoutForSlug(slug);
  res.json(result);
}
