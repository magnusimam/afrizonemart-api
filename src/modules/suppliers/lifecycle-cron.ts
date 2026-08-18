import { env } from '@/config/env';
import { logger } from '@/infra/logger';
import { prisma } from '@/infra/prisma';
import { notifyPODueSoon, notifyPOUnacknowledged } from './notify';

/**
 * Supplier lifecycle cron — the time-based purchase-order reminders.
 *
 *   • `supplier.po.unacknowledged` — issued ≥48h ago, still not acknowledged
 *   • `supplier.po.due.soon`       — delivery due within 3 days
 *
 * Modelled directly on `reviews/review-nudge-cron.ts`, which is the proven
 * pattern in this codebase. Three properties matter and each is deliberate:
 *
 * 1. BOUNDED WINDOWS, not "older than". A lower bound means that if the cron
 *    is down for a week and recovers, it does not suddenly fire a week of
 *    backlogged reminders at real businesses.
 * 2. IDEMPOTENCY MARKER WRITTEN AFTER A SUCCESSFUL SEND. The marker here is
 *    the `Notification` row itself, tagged with the PO id in `context` — so a
 *    crash mid-sweep retries rather than double-sends, and a send that failed
 *    is genuinely retried.
 * 3. BATCH CAP. An unbounded sweep against 83 suppliers with many open orders
 *    is exactly how a cron turns into an incident.
 *
 * DRY RUN BY DEFAULT (`SUPPLIER_LIFECYCLE_SEND=0`). It logs precisely who
 * would receive what and writes nothing. Read those logs for a few days
 * before enabling — per SUPPLIER_EMAIL_SEQUENCE.md §5 phase 4.
 */

const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly
const STARTUP_DELAY_MS = 120 * 1000;
const BATCH_LIMIT = 100;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Acknowledgement chase: issued between 7 days and 48 hours ago. */
const UNACK_AFTER_MS = 48 * HOUR;
const UNACK_MAX_AGE_MS = 7 * DAY;

/** Delivery chase: due within the next 3 days (and not already past due). */
const DUE_SOON_WITHIN_MS = 3 * DAY;

let sweeping = false;

/**
 * Has this exact reminder already gone out for this PO?
 *
 * `Notification.context` carries `{ poId }`, so this is per-order rather than
 * per-supplier — a supplier with three late orders should hear about all
 * three, which is why the once-ever guard used for lifecycle emails would be
 * wrong here. Only SENT counts, so a failed send is retried next sweep.
 */
async function alreadySentForPO(type: string, poId: string): Promise<boolean> {
  const existing = await prisma.notification.findFirst({
    where: { type, status: 'SENT', context: { path: ['poId'], equals: poId } },
    select: { id: true },
  });
  return existing !== null;
}

interface Candidate {
  id: string;
  poNumber: string;
  currency: string;
  totalAmount: number;
  dueDate: Date | null;
  supplier: {
    contactName: string;
    userId: string;
    user: { email: string; name: string | null };
  };
}

const CANDIDATE_SELECT = {
  id: true,
  poNumber: true,
  currency: true,
  totalAmount: true,
  dueDate: true,
  supplier: {
    select: {
      contactName: true,
      userId: true,
      user: { select: { email: true, name: true } },
    },
  },
} as const;

async function sweepUnacknowledged(dryRun: boolean): Promise<{ found: number; sent: number }> {
  const now = Date.now();
  const candidates = (await prisma.purchaseOrder.findMany({
    where: {
      status: 'ISSUED',
      createdAt: {
        gte: new Date(now - UNACK_MAX_AGE_MS),
        lte: new Date(now - UNACK_AFTER_MS),
      },
    },
    select: CANDIDATE_SELECT,
    take: BATCH_LIMIT,
  })) as Candidate[];

  let sent = 0;
  for (const po of candidates) {
    try {
      if (await alreadySentForPO('supplier.po.unacknowledged', po.id)) continue;

      if (dryRun) {
        logger.info('supplier.lifecycle_cron.dry_run', {
          type: 'supplier.po.unacknowledged',
          poNumber: po.poNumber,
          to: po.supplier.user.email,
        });
        sent++;
        continue;
      }

      await notifyPOUnacknowledged({
        to: po.supplier.user.email,
        userId: po.supplier.userId,
        recipientName: po.supplier.user.name ?? po.supplier.contactName,
        poNumber: po.poNumber,
        currency: po.currency,
        totalAmount: po.totalAmount,
        poId: po.id,
      });
      sent++;
    } catch (err) {
      logger.error('supplier.lifecycle_cron.row_failed', {
        type: 'supplier.po.unacknowledged',
        poId: po.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { found: candidates.length, sent };
}

async function sweepDueSoon(dryRun: boolean): Promise<{ found: number; sent: number }> {
  const now = Date.now();
  const candidates = (await prisma.purchaseOrder.findMany({
    where: {
      // Only orders they've committed to. Chasing a delivery date on an order
      // the supplier never acknowledged is the wrong message — the
      // unacknowledged sweep above owns that case.
      status: 'ACKNOWLEDGED',
      dueDate: {
        gte: new Date(now),
        lte: new Date(now + DUE_SOON_WITHIN_MS),
      },
    },
    select: CANDIDATE_SELECT,
    take: BATCH_LIMIT,
  })) as Candidate[];

  let sent = 0;
  for (const po of candidates) {
    try {
      if (!po.dueDate) continue;
      if (await alreadySentForPO('supplier.po.due.soon', po.id)) continue;

      if (dryRun) {
        logger.info('supplier.lifecycle_cron.dry_run', {
          type: 'supplier.po.due.soon',
          poNumber: po.poNumber,
          to: po.supplier.user.email,
          dueDate: po.dueDate,
        });
        sent++;
        continue;
      }

      await notifyPODueSoon({
        to: po.supplier.user.email,
        userId: po.supplier.userId,
        recipientName: po.supplier.user.name ?? po.supplier.contactName,
        poNumber: po.poNumber,
        deliveryDue: po.dueDate,
        poId: po.id,
      });
      sent++;
    } catch (err) {
      logger.error('supplier.lifecycle_cron.row_failed', {
        type: 'supplier.po.due.soon',
        poId: po.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { found: candidates.length, sent };
}

async function sweep(): Promise<void> {
  if (sweeping) return;
  sweeping = true;
  const dryRun = !env.SUPPLIER_LIFECYCLE_SEND;
  try {
    const unack = await sweepUnacknowledged(dryRun);
    const due = await sweepDueSoon(dryRun);
    logger.info('supplier.lifecycle_cron.swept', {
      dryRun,
      unacknowledged: unack,
      dueSoon: due,
    });
  } catch (err) {
    logger.error('supplier.lifecycle_cron.sweep_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    sweeping = false;
  }
}

export function startSupplierLifecycleCron(): void {
  setTimeout(() => void sweep(), STARTUP_DELAY_MS);
  setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
  logger.info('supplier.lifecycle_cron.started', {
    intervalMs: SWEEP_INTERVAL_MS,
    dryRun: !env.SUPPLIER_LIFECYCLE_SEND,
    batchLimit: BATCH_LIMIT,
  });
}

/** Exposed for tests and for a manual one-off sweep. */
export const __sweepForTests = sweep;
