import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { env } from '@/config/env';

/**
 * Stage 5 orientation — the evergreen "live" webinar. The schedule itself
 * (daily go-live time + join window) is computed client-side against the
 * config returned here, so the countdown stays in sync without server polling.
 * Supplier comments posted during the "live" are persisted for the Supplier
 * Relations Desk (many are real questions to follow up on).
 */

async function profileIdOrThrow(userId: string): Promise<string> {
  const p = await prisma.supplierProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!p) throw HttpError.notFound('No supplier profile for this account');
  return p.id;
}

export interface OwnComment {
  id: string;
  body: string;
  atSeconds: number | null;
  isQuestion: boolean;
  answeredAt: string | null;
  createdAt: string;
}

export interface OrientationConfig {
  videoUrl: string;
  /** Daily go-live hour in UTC (21:00 WAT = 20:00 UTC by default). */
  liveHourUtc: number;
  joinWindowMins: number;
  myComments: OwnComment[];
}

export async function getOrientation(userId: string): Promise<OrientationConfig> {
  const supplierId = await profileIdOrThrow(userId);
  const comments = await prisma.orientationComment.findMany({
    where: { supplierId },
    orderBy: { createdAt: 'asc' },
  });
  return {
    videoUrl: env.ORIENTATION_VIDEO_URL ?? `${env.API_PUBLIC_URL}/api/orientation/video`,
    liveHourUtc: env.ORIENTATION_LIVE_HOUR_UTC,
    joinWindowMins: env.ORIENTATION_JOIN_WINDOW_MINS,
    myComments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      atSeconds: c.atSeconds ?? null,
      isQuestion: c.isQuestion,
      answeredAt: c.answeredAt ? c.answeredAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

export async function postOrientationComment(
  userId: string,
  input: { body: string; atSeconds?: number },
): Promise<OwnComment> {
  const supplierId = await profileIdOrThrow(userId);
  const c = await prisma.orientationComment.create({
    data: {
      supplierId,
      body: input.body,
      atSeconds: input.atSeconds ?? null,
      // Auto-flag questions so the desk can spot them fast (admin can override).
      isQuestion: /\?/.test(input.body),
    },
  });
  return {
    id: c.id,
    body: c.body,
    atSeconds: c.atSeconds ?? null,
    isQuestion: c.isQuestion,
    answeredAt: null,
    createdAt: c.createdAt.toISOString(),
  };
}
