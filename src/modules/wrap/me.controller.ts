import type { Request, Response } from 'express';
import { HttpError } from '@/middleware/error-handler';
import type { AuthedRequest } from '@/middleware/auth';
import { getWrapForUser } from './me.service';
import { signShareToken, verifyShareToken } from './share-token';

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

/**
 * GET /api/wrap/me/share-token?year=2026
 *
 * Mints a short-lived signed token the share-image route exchanges
 * for this user's stats. Auth required — only the owner can mint.
 */
export async function wrapShareTokenHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const year =
    typeof req.query.year === 'string'
      ? Number.parseInt(req.query.year, 10)
      : new Date().getUTCFullYear();
  if (!Number.isFinite(year)) throw HttpError.badRequest('invalid year');
  res.json({ token: signShareToken(req.user.id, year), year });
}

/**
 * GET /api/wrap/shared?token=<t>
 *
 * PUBLIC (token-gated). Exchanges a valid share token for the wrap
 * stats — but only if that wrap is actually live (published +
 * visible). Used by the share-image renderer. Returns 404 for an
 * invalid/expired token or a not-yet-live wrap, so nothing leaks.
 */
export async function wrapSharedHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const claims = token ? verifyShareToken(token) : null;
  if (!claims) throw HttpError.notFound('Wrap not available.');

  const result = await getWrapForUser(claims.userId, claims.year);
  if (result.status !== 'ready') throw HttpError.notFound('Wrap not available.');
  res.json({ year: result.year, stats: result.stats });
}
