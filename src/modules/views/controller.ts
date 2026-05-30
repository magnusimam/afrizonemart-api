import type { Response } from 'express';
import type { AuthedRequest } from '@/middleware/auth';
import { logger } from '@/infra/logger';
import { createViewBodySchema } from './schema';
import { recordViewService } from './service';

/**
 * HTTP layer for product view tracking — zod parse → service → JSON.
 *
 * Auth is OPTIONAL. The route uses `optionalAuth` middleware so
 * `req.user` is set when a token is present but the endpoint accepts
 * anonymous viewers too (they still count toward trending).
 *
 * Errors are swallowed at the controller level after logging — the
 * PDP shouldn't see a 5xx from a tracking call. We always return 204
 * so clients can fire-and-forget without retry logic.
 */
export async function recordViewHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  try {
    const body = createViewBodySchema.parse(req.body);
    await recordViewService(body, req.user?.id ?? null);
  } catch (err) {
    /// Log but never propagate. Trending is best-effort; a tracker
    /// 5xx is worse than a missed event.
    logger.warn('views.record.failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  res.status(204).end();
}
