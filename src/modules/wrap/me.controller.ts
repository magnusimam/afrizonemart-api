import type { Response } from 'express';
import { HttpError } from '@/middleware/error-handler';
import type { AuthedRequest } from '@/middleware/auth';
import { getWrapForUser } from './me.service';

/**
 * GET /api/wrap/me?year=2026
 *
 * Returns the authenticated user's wrap state (see WrapMeResult).
 * Always 200 for the expected states — the deck branches on
 * `status`. Year defaults to the current UTC year.
 */
export async function wrapMeHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();

  const year =
    typeof req.query.year === 'string'
      ? Number.parseInt(req.query.year, 10)
      : new Date().getUTCFullYear();
  if (!Number.isFinite(year)) throw HttpError.badRequest('invalid year');

  const result = await getWrapForUser(req.user.id, year);
  res.json(result);
}
