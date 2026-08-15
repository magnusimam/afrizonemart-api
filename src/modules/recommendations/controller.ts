import type { Response } from 'express';
import type { AuthedRequest } from '@/middleware/auth';
import {
  alsoBoughtQuerySchema,
  frequentlyBoughtTogetherQuerySchema,
  similarQuerySchema,
  trackClickBodySchema,
  trendingQuerySchema,
  viewedAlsoViewedQuerySchema,
} from './schema';
import {
  alsoBought,
  frequentlyBoughtTogether,
  similar,
  trackClick,
  trending,
  viewedAlsoViewedModule,
} from './service';

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

export async function alsoBoughtHandler(req: AuthedRequest, res: Response): Promise<void> {
  const query = alsoBoughtQuerySchema.parse(req.query);
  const result = await alsoBought(query, { userId: req.user?.id });
  res.json(result);
}

export async function frequentlyBoughtTogetherHandler(req: AuthedRequest, res: Response): Promise<void> {
  const query = frequentlyBoughtTogetherQuerySchema.parse(req.query);
  const result = await frequentlyBoughtTogether(query, { userId: req.user?.id });
  res.json(result);
}

export async function viewedAlsoViewedHandler(req: AuthedRequest, res: Response): Promise<void> {
  const query = viewedAlsoViewedQuerySchema.parse(req.query);
  const result = await viewedAlsoViewedModule(query, { userId: req.user?.id });
  res.json(result);
}
