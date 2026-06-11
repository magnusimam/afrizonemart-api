import type { Response } from 'express';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import type { AuthedRequest } from '@/middleware/auth';
import {
  publishWrapsForYear,
  upsertUserWrap,
} from './service';
import { computeUserWrap } from './aggregation';
import { computeMockWrap } from './mock';
import type { WrappedPersonality } from './types';

const PERSONALITIES: readonly WrappedPersonality[] = [
  'CONNECTOR',
  'PATRIOT',
  'EXPLORER',
  'CURATOR',
];

/**
 * POST /api/admin/wrap/mock-preview
 *
 * Body: { personality, homeCountry?, totalOrders? }
 *
 * Returns a fully-shaped WrappedStatsV1 synthesised from the persona
 * knobs — no DB read/write. Powers the /admin/wrap/demo console so
 * stakeholders can preview every card before the Dec 1 drop.
 */
export async function adminMockPreviewWrapHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const personality = body.personality;
  if (
    typeof personality !== 'string' ||
    !PERSONALITIES.includes(personality as WrappedPersonality)
  ) {
    throw HttpError.badRequest(
      `personality must be one of: ${PERSONALITIES.join(', ')}`,
    );
  }
  const homeCountry =
    typeof body.homeCountry === 'string' ? body.homeCountry : null;
  const totalOrders =
    typeof body.totalOrders === 'number' ? body.totalOrders : undefined;

  const stats = computeMockWrap({
    personality: personality as WrappedPersonality,
    homeCountry,
    totalOrders,
  });
  res.json({ stats });
}

/**
 * GET /api/admin/wrap/stats
 *
 * Per-year snapshot counts (total / visible / published) for the
 * admin index. Pure aggregate read over WrappedSnapshot.
 */
export async function adminWrapStatsHandler(
  _req: AuthedRequest,
  res: Response,
): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      year: number;
      snapshots: number;
      visible: number;
      published: number;
    }>
  >(
    `
    SELECT
      year,
      COUNT(*)::int AS snapshots,
      COUNT(*) FILTER (WHERE visible)::int AS visible,
      COUNT(*) FILTER (WHERE "publishedAt" IS NOT NULL)::int AS published
    FROM "WrappedSnapshot"
    GROUP BY year
    ORDER BY year DESC
    `,
  );
  res.json({ years: rows });
}

/**
 * GET /api/admin/wrap/preview?userId=<id>&year=<year>
 *
 * Returns the LIVE-computed stats for any user / year. Used by
 * ops during QA pass before the Dec 1 drop. Doesn't touch
 * WrappedSnapshot — pure read. Year defaults to current.
 */
export async function adminPreviewWrapHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const userId =
    typeof req.query.userId === 'string' ? req.query.userId : null;
  const year =
    typeof req.query.year === 'string'
      ? Number.parseInt(req.query.year, 10)
      : new Date().getUTCFullYear();
  if (!userId) throw HttpError.badRequest('userId required');
  if (!Number.isFinite(year)) throw HttpError.badRequest('invalid year');

  const stats = await computeUserWrap(userId, year);
  if (!stats) {
    res.json({ stats: null, reason: 'below_min_orders' });
    return;
  }
  res.json({ stats, reason: null });
}

/**
 * POST /api/admin/wrap/recompute?userId=<id>&year=<year>
 *
 * Force-recompute a single user's snapshot. Useful when a data
 * fix lands and we want to refresh one specific row without
 * waiting for the next daily sweep.
 */
export async function adminRecomputeWrapHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const userId =
    typeof req.query.userId === 'string' ? req.query.userId : null;
  const year =
    typeof req.query.year === 'string'
      ? Number.parseInt(req.query.year, 10)
      : new Date().getUTCFullYear();
  if (!userId) throw HttpError.badRequest('userId required');
  if (!Number.isFinite(year)) throw HttpError.badRequest('invalid year');

  const result = await upsertUserWrap(userId, year);
  res.json(result);
}

/**
 * POST /api/admin/wrap/publish?year=<year>
 *
 * Manually trigger the annual publish (normally Dec 1 09:00 GMT
 * via cron). Useful for QA on test environments + as a
 * disaster-recovery lever if the cron fails to fire.
 */
export async function adminPublishWrapsHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const year =
    typeof req.query.year === 'string'
      ? Number.parseInt(req.query.year, 10)
      : new Date().getUTCFullYear();
  if (!Number.isFinite(year)) throw HttpError.badRequest('invalid year');
  const count = await publishWrapsForYear(year);
  res.json({ published: count });
}

/**
 * PATCH /api/admin/wrap/:id
 *
 * Toggle wrap visibility (PII concern / support request / data
 * issue). Hidden wraps return 404 to the customer endpoint.
 */
export async function adminToggleWrapVisibilityHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing wrap id');
  const visible = req.body?.visible;
  if (typeof visible !== 'boolean') {
    throw HttpError.badRequest('visible must be a boolean');
  }
  const row = await prisma.wrappedSnapshot.update({
    where: { id },
    data: { visible },
    select: { id: true, visible: true },
  });
  res.json(row);
}
