import { prisma } from '@/infra/prisma';
import type { PushPlatform } from '@prisma/client';

/**
 * PushToken persistence layer.
 *
 * Upsert-by-token semantics so a token rebound to a new user (same
 * device, family-shared tablet) re-attaches cleanly without leaving
 * orphan rows. The Expo token itself is globally unique inside Expo
 * — they never re-issue the same string to a different device.
 */

export interface UpsertTokenInput {
  userId: string;
  token: string;
  platform: PushPlatform;
}

export async function upsertPushToken(input: UpsertTokenInput) {
  return prisma.pushToken.upsert({
    where: { token: input.token },
    create: {
      userId: input.userId,
      token: input.token,
      platform: input.platform,
    },
    update: {
      /// Reassign device if the token now belongs to a different
      /// user. Bumps `lastUsedAt` too — counts as activity.
      userId: input.userId,
      lastUsedAt: new Date(),
    },
  });
}

export function deletePushToken(token: string) {
  return prisma.pushToken.deleteMany({ where: { token } });
}

/// Find all tokens belonging to a user that we'd consider fresh
/// enough to attempt a send. Tokens older than 30 days are excluded
/// — FCM/APNs would 410-Gone them anyway.
export function findFreshTokensForUser(userId: string) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return prisma.pushToken.findMany({
    where: {
      userId,
      lastUsedAt: { gte: cutoff },
    },
  });
}

export function touchPushToken(token: string) {
  return prisma.pushToken
    .update({
      where: { token },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {
      /// Token disappeared mid-flight (user logged out concurrently).
      /// Not worth surfacing — the send already happened.
    });
}
