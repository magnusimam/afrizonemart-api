import { prisma } from '@/infra/prisma';
import { countQualifyingOrders, MIN_ORDERS } from './aggregation';
import type { WrappedStatsV1 } from './types';

/**
 * Customer-facing "my wrap" resolver — the brain behind
 * GET /api/wrap/me.
 *
 * Returns a discriminated state instead of throwing a 404 for the
 * not-yet states: a customer opening their wrap before the Dec 1
 * drop (or before they've hit the order threshold) is an EXPECTED
 * outcome, not an error. Modelling it as a 200 keeps those visits
 * out of the error logs and lets the deck pick the right friendly
 * screen ("coming Dec 1" vs "unlock at 3 orders").
 *
 *   ready    — published + visible snapshot → full stats.
 *   pending  — eligible (computed, or ≥3 orders) but not yet
 *              published, OR hidden by ops. Deck shows "drops Dec 1".
 *   locked   — below the order threshold. Deck shows the teaser with
 *              their current count.
 *   optedOut — user turned the wrap off in settings.
 */

export type WrapMeResult =
  | { status: 'ready'; year: number; publishedAt: string; stats: WrappedStatsV1 }
  | { status: 'pending'; year: number; dropAt: string }
  | { status: 'locked'; year: number; ordersCount: number; minOrders: number }
  | { status: 'optedOut'; year: number };

/**
 * The annual drop moment: Dec 1, 09:00 GMT of the wrap year. Used
 * for the "coming soon" countdown.
 */
function dropAtFor(year: number): string {
  return new Date(Date.UTC(year, 11, 1, 9, 0, 0)).toISOString();
}

export async function getWrapForUser(
  userId: string,
  year: number,
): Promise<WrapMeResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { wrapOptOut: true },
  });
  if (user?.wrapOptOut) return { status: 'optedOut', year };

  const snapshot = await prisma.wrappedSnapshot.findUnique({
    where: { userId_year: { userId, year } },
    select: { stats: true, visible: true, publishedAt: true },
  });

  if (snapshot) {
    if (snapshot.visible && snapshot.publishedAt) {
      return {
        status: 'ready',
        year,
        publishedAt: snapshot.publishedAt.toISOString(),
        stats: snapshot.stats as unknown as WrappedStatsV1,
      };
    }
    // Computed but not published yet, or hidden by ops — don't leak
    // which; both surface as "coming soon".
    return { status: 'pending', year, dropAt: dropAtFor(year) };
  }

  // No snapshot row. Eligible-but-not-yet-swept users still see the
  // anticipation screen; everyone else gets the unlock teaser with
  // their live order count.
  const ordersCount = await countQualifyingOrders(userId, year);
  if (ordersCount >= MIN_ORDERS) {
    return { status: 'pending', year, dropAt: dropAtFor(year) };
  }
  return { status: 'locked', year, ordersCount, minOrders: MIN_ORDERS };
}
