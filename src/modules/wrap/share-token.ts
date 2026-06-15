import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/config/env';

/**
 * Signed, short-lived token authorising a single user's wrap to be
 * rendered as a public share image.
 *
 * Why: the share-image route (afrizonemart-v2) is public — a posted
 * wrap is meant to be seen. But we can't let anyone pull ANY user's
 * wrap stats by guessing their id. The logged-in user's page mints a
 * token (HMAC-signed with JWT_SECRET, so the secret never leaves the
 * API), the image route exchanges it for stats, and the user shares
 * the resulting PNG *file* — so the 1h TTL only has to outlive the
 * share action, not the posted image.
 *
 * Format: `<base64url(payload)>.<base64url(hmac)>` where payload is
 * `{ u: userId, y: year, e: expiryMs }`.
 */

const TTL_MS = 60 * 60 * 1000; // 1 hour

function sign(payload: string): string {
  return createHmac('sha256', env.JWT_SECRET).update(payload).digest('base64url');
}

export function signShareToken(userId: string, year: number): string {
  const payload = Buffer.from(
    JSON.stringify({ u: userId, y: year, e: Date.now() + TTL_MS }),
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyShareToken(
  token: string,
): { userId: string; year: number } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;

  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as { u?: unknown; y?: unknown; e?: unknown };
    if (
      typeof data.u !== 'string' ||
      typeof data.y !== 'number' ||
      typeof data.e !== 'number'
    ) {
      return null;
    }
    if (Date.now() > data.e) return null;
    return { userId: data.u, year: data.y };
  } catch {
    return null;
  }
}
