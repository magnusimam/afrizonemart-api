import type { Request, Response } from 'express';
import { z } from 'zod';
import { getOrCreateCutoutForSlug } from './service';

const slugParam = z.object({ slug: z.string().min(1).max(200) });
const querySchema = z.object({
  force: z.enum(['0', '1']).optional(),
});

/**
 * GET /api/share-image/cutout/:slug
 * Optional query: `?force=1` to bypass the R2 cache (re-run removal
 * provider, overwrite cached object). Useful after rotating provider
 * config (e.g. setting REMOVE_BG_API_KEY) so existing products that
 * previously cached the NoopProvider pass-through can pick up the
 * proper cutout without waiting for a new product upload.
 *
 * Returns a JSON payload with the cached (or freshly generated)
 * cutout URL for the product. Public — no auth required, sharing is
 * meant to be friction-free. Rate-limited at the route layer to
 * deter cold-cache flooding.
 */
export async function getCutoutHandler(req: Request, res: Response): Promise<void> {
  const { slug } = slugParam.parse(req.params);
  const { force } = querySchema.parse(req.query);
  const result = await getOrCreateCutoutForSlug(slug, { force: force === '1' });
  res.json(result);
}
