import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/config/env';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';

/**
 * Tracker #48 — signed one-click unsubscribe tokens.
 *
 * Every marketing email embeds a link like
 *   https://afrizonemart.com/unsubscribe?token=<userId>.<channel>.<sig>
 *
 * The token is stateless: we don't store anything per-token, we just
 * verify the HMAC signature using `JWT_SECRET`. That makes it
 * impossible to forge (without the secret) and there's no DB
 * round-trip to issue or look up — so generating thousands of
 * unsubscribe links for a campaign blast is free.
 *
 * Tokens don't expire. The customer should be able to click
 * "unsubscribe" on an email we sent them three years ago and still
 * have it work. The flag is idempotent — clicking twice does the
 * same thing.
 *
 * Channel is `email` or `sms` so the same helper can serve both
 * surfaces. Unknown channels are rejected.
 */

export type UnsubscribeChannel = 'email' | 'sms';

const VALID_CHANNELS: UnsubscribeChannel[] = ['email', 'sms'];

function hmac(payload: string): string {
  return createHmac('sha256', env.JWT_SECRET)
    .update(payload)
    .digest('base64url');
}

/// Build an unsubscribe token for one (userId, channel) pair.
/// Marketing email templates call this once per recipient.
export function buildUnsubscribeToken(
  userId: string,
  channel: UnsubscribeChannel,
): string {
  const payload = `${userId}.${channel}`;
  return `${payload}.${hmac(payload)}`;
}

/// Public storefront URL the customer clicks. Returned by the
/// helper so callers don't have to reconstruct it.
export function buildUnsubscribeUrl(
  userId: string,
  channel: UnsubscribeChannel,
): string {
  const token = buildUnsubscribeToken(userId, channel);
  return `${env.WEB_URL}/unsubscribe?token=${encodeURIComponent(token)}`;
}

interface ParsedToken {
  userId: string;
  channel: UnsubscribeChannel;
}

function parseToken(token: string): ParsedToken {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw HttpError.badRequest('Malformed unsubscribe token.');
  }
  const [userId, channel, sig] = parts;
  if (!VALID_CHANNELS.includes(channel as UnsubscribeChannel)) {
    throw HttpError.badRequest('Unknown channel in unsubscribe token.');
  }
  const expected = hmac(`${userId}.${channel}`);
  // Constant-time compare so signature mismatches can't be probed
  // for timing differences.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw HttpError.badRequest('Invalid unsubscribe token signature.');
  }
  return { userId, channel: channel as UnsubscribeChannel };
}

export interface UnsubscribeResult {
  userId: string;
  channel: UnsubscribeChannel;
  email: string | null;
  /// True when the customer was opted in before this call; false when
  /// they were already opted out (idempotent — still 200, but UI can
  /// say "you were already unsubscribed").
  changed: boolean;
}

export async function applyUnsubscribe(token: string): Promise<UnsubscribeResult> {
  const { userId, channel } = parseToken(token);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, marketingOptIn: true, smsOptIn: true },
  });
  if (!user) {
    // We don't reveal whether the userId exists — but rejecting the
    // click silently would frustrate a real user. Treat as success.
    return { userId, channel, email: null, changed: false };
  }
  const currentlyOptedIn =
    channel === 'email' ? user.marketingOptIn : user.smsOptIn;
  if (!currentlyOptedIn) {
    return { userId, channel, email: user.email, changed: false };
  }
  await prisma.user.update({
    where: { id: userId },
    data:
      channel === 'email'
        ? { marketingOptIn: false }
        : { smsOptIn: false },
  });
  return { userId, channel, email: user.email, changed: true };
}
