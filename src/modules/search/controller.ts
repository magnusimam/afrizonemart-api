import type { Response } from 'express';
import type { AuthedRequest } from '@/middleware/auth';
import { autocompleteQuerySchema, searchQuerySchema, trackClickBodySchema } from './schema';
import { autocomplete, search, trackSearchClick } from './service';

/**
 * HTTP layer for the Search module (Rule B1 — API-First). Validates
 * with Zod, calls the service, returns JSON. No Prisma/business logic
 * here — see `service.ts` / `repository.ts`.
 */

export async function searchHandler(req: AuthedRequest, res: Response): Promise<void> {
  const query = searchQuerySchema.parse(req.query);
  const result = await search(query, { userId: req.user?.id });
  res.json(result);
}

export async function autocompleteHandler(req: AuthedRequest, res: Response): Promise<void> {
  const query = autocompleteQuerySchema.parse(req.query);
  const result = await autocomplete(query);
  res.json(result);
}

export async function trackClickHandler(req: AuthedRequest, res: Response): Promise<void> {
  const body = trackClickBodySchema.parse(req.body);
  await trackSearchClick(body.queryLogId, body.productId);
  res.status(204).end();
}
