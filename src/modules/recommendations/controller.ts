import type { Response } from 'express';
import type { AuthedRequest } from '@/middleware/auth';
import { similarQuerySchema, trackClickBodySchema, trendingQuerySchema } from './schema';
import { similar, trackClick, trending } from './service';

/**
 * HTTP layer for the Recommendations module (Rule B1 — API-First).
 * Validates with Zod, calls the service, returns JSON. No Prisma/
 * business logic here — see `service.ts` / `repository.ts`.
 */

export async function similarHandler(req: AuthedRequest, res: Response): Promise<void> {
  const query = similarQuerySchema.parse(req.query);
  const result = await similar(query, { userId: req.user?.id });
  res.json(result);
}

export async function trendingHandler(req: AuthedRequest, res: Response): Promise<void> {
  const query = trendingQuerySchema.parse(req.query);
  const result = await trending(query, { userId: req.user?.id });
  res.json(result);
}

export async function trackClickHandler(req: AuthedRequest, res: Response): Promise<void> {
  const body = trackClickBodySchema.parse(req.body);
  await trackClick(body.impressionId, body.productId);
  res.status(204).end();
}
