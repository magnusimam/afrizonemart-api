import type { Response } from 'express';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import type { AuthedRequest } from '@/middleware/auth';
import {
  publishWrapsForYear,
  upsertUserWrap,
} from './service';
import { computeUserWrap } from './aggregation';
import { buildMockWrapStats } from './mock';
import type { WrappedPersonality } from './types';

const VALID_PERSONALITIES: WrappedPersonality[] = [
  'CONNECTOR',
  'PATRIOT',
  'EXPLORER',
  'CURATOR',
];

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

/**
 * POST /api/admin/wrap/mock-preview
 *
 * Returns a fully-shaped `WrappedStatsV1` synthesised from a small
 * set of persona knobs. NEVER reads from or writes to Prisma. Used
 * by the admin live-demo page so designers + ops can see the 9-card
 * deck without seeding a real user with 3+ qualifying orders.
 *
 * Body: { personality, homeCountry?, totalOrders? }
 */
export async function adminMockPreviewWrapHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const body = req.body ?? {};
  const personality = body.personality as WrappedPersonality | undefined;
  if (!personality || !VALID_PERSONALITIES.includes(personality)) {
    throw HttpError.badRequest(
      `personality must be one of: ${VALID_PERSONALITIES.join(', ')}`,
    );
  }
  const homeCountry =
    body.homeCountry === null
      ? null
      : typeof body.homeCountry === 'string'
        ? body.homeCountry.toUpperCase()
        : undefined;
  const totalOrders =
    typeof body.totalOrders === 'number' ? body.totalOrders : undefined;

  const stats = buildMockWrapStats({ personality, homeCountry, totalOrders });
  res.json({ stats });
}

/**
 * GET /api/admin/wrap/stats
 *
 * Lightweight aggregate for the admin index page — how many
 * snapshots exist per year, how many are published, how many
 * are hidden. Cheap GROUP BY on a single column-set.
 */
export async function adminWrapStatsHandler(
  _req: AuthedRequest,
  res: Response,
): Promise<void> {
  const rows = await prisma.wrappedSnapshot.groupBy({
    by: ['year'],
    _count: { _all: true },
  });
  const visibleRows = await prisma.wrappedSnapshot.groupBy({
    by: ['year'],
    where: { visible: true },
    _count: { _all: true },
  });
  const publishedRows = await prisma.wrappedSnapshot.groupBy({
    by: ['year'],
    where: { publishedAt: { not: null } },
    _count: { _all: true },
  });
  const visByYear = new Map(visibleRows.map((r) => [r.year, r._count._all]));
  const pubByYear = new Map(publishedRows.map((r) => [r.year, r._count._all]));
  const years = rows
    .map((r) => ({
      year: r.year,
      snapshots: r._count._all,
      visible: visByYear.get(r.year) ?? 0,
      published: pubByYear.get(r.year) ?? 0,
    }))
    .sort((a, b) => b.year - a.year);
  res.json({ years });
}
