import type { Response } from 'express';
import type { AuthedRequest } from '@/middleware/auth';
import { HttpError } from '@/middleware/error-handler';
import { deletePushToken, upsertPushToken } from './repository';
import { registerTokenSchema } from './schema';

function userIdOr401(req: AuthedRequest): string {
  if (!req.user) throw HttpError.unauthorized();
  return req.user.id;
}

/**
 * POST /api/push/tokens — register or refresh a device's push token.
 *
 * Idempotent: the same token can be re-posted on every app launch.
 * The repository upserts by token so re-binding to a new user
 * (family-shared device) just moves the row. Returns the persisted
 * row id so the client can drop the token cleanly on sign-out.
 */
export async function registerTokenHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const parse = registerTokenSchema.safeParse(req.body);
  if (!parse.success) {
    throw HttpError.badRequest(parse.error.issues[0]?.message ?? 'Bad request');
  }
  const userId = userIdOr401(req);
  const row = await upsertPushToken({
    userId,
    token: parse.data.token,
    platform: parse.data.platform,
  });
  res.json({ id: row.id });
}

/**
 * DELETE /api/push/tokens/:token — remove a token from the user's
 * device list. Called on sign-out from the mobile app.
 *
 * Idempotent — deleting a token that doesn't exist returns 204
 * cleanly, so a stale client retry can't fail.
 */
export async function deleteTokenHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const token = req.params.token;
  if (!token) throw HttpError.badRequest('Missing token');
  await deletePushToken(token);
  res.status(204).end();
}
