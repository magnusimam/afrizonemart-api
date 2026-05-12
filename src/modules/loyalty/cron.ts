import { LoyaltyTransactionType } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { logger } from '@/infra/logger';
import {
  applyLoyaltyTransaction,
  getLoyaltyConfig,
  tierForSpend,
} from './service';

/**
 * Continental Rewards daily maintenance cron (Tracker #44 PR 4).
 *
 * Two jobs combined into one nightly sweep:
 *
 *  1. **Coin expiry.** Finds `EARN` and `WELCOME_BONUS` ledger rows
 *     where `expiresAt < now` AND `expiredAt IS NULL`. For each one,
 *     issues a matching `EXPIRY` debit (delta = -unredeemed portion)
 *     and stamps `expiredAt` on the original row so it doesn't
 *     re-expire. FIFO is implicit in the order of processing
 *     (oldest createdAt first); we never expire a row whose coins
 *     have already been redeemed.
 *
 *  2. **Tier recompute.** For every enrolled customer, recompute
 *     rolling-window spend and update the cached `currentTier` if
 *     it has changed. This handles two cases the live earn flow
 *     doesn't catch:
 *       - Tier *downgrade* when the window slides past old spend.
 *         (Earn-time only upgrades — never demotes — so the cache
 *         drifts upward over time without this.)
 *       - Operator-edited tier thresholds. If admin changes
 *         `tier2GoldThreshold` from ₦80k to ₦100k, customers
 *         sitting in Gold at ₦85k should drop back to Blue at
 *         the next sweep.
 *
 * Runs every 6 hours. Sweep on startup after a 5-minute delay
 * (DB pool warm + dispatcher boot complete).
 */

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours
const STARTUP_DELAY_MS = 5 * 60 * 1000;       // 5-min startup delay

let sweeping = false;

async function expireOverdueCoins(): Promise<{ accountsTouched: number; coinsExpired: number }> {
  const now = new Date();
  const overdue = await prisma.loyaltyTransaction.findMany({
    where: {
      type: { in: [LoyaltyTransactionType.EARN, LoyaltyTransactionType.WELCOME_BONUS] },
      expiresAt: { lte: now },
      expiredAt: null,
    },
    orderBy: { createdAt: 'asc' },
  });

  // Compute outstanding-balance-from-this-row by walking subsequent
  // ledger entries for the same account. Conservative approach:
  // we expire the full original delta. If the customer has spent
  // those coins via REDEEM already, the remaining balance check
  // inside `applyLoyaltyTransaction` will throw, we catch and skip
  // — the coins are gone anyway from a customer-balance POV.
  let accountsTouched = 0;
  let coinsExpired = 0;
  const touchedAccounts = new Set<string>();
  for (const row of overdue) {
    try {
      // Cap the expiry to the customer's *current* balance, not
      // the original delta — otherwise a customer who has redeemed
      // some coins gets their balance pushed negative. Conservative:
      // we expire min(originalDelta, currentBalance) and stamp the
      // row as expired regardless so it doesn't re-process.
      const account = await prisma.loyaltyAccount.findUnique({
        where: { id: row.accountId },
        select: { coinBalance: true },
      });
      if (!account) continue;
      const expireAmount = Math.min(row.delta, account.coinBalance);
      if (expireAmount > 0) {
        await applyLoyaltyTransaction({
          accountId: row.accountId,
          delta: -expireAmount,
          type: LoyaltyTransactionType.EXPIRY,
          reason: `${expireAmount} coins from earn on ${row.createdAt.toISOString().slice(0, 10)} expired`,
        });
        coinsExpired += expireAmount;
      }
      await prisma.loyaltyTransaction.update({
        where: { id: row.id },
        data: { expiredAt: now },
      });
      if (!touchedAccounts.has(row.accountId)) {
        touchedAccounts.add(row.accountId);
        accountsTouched += 1;
      }
    } catch (err) {
      logger.warn('loyalty.cron.expire_failed', {
        rowId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { accountsTouched, coinsExpired };
}

async function recomputeAllTiers(): Promise<{ accountsChecked: number; tiersChanged: number }> {
  const cfg = await getLoyaltyConfig();
  const windowStart = new Date();
  windowStart.setMonth(windowStart.getMonth() - cfg.spendWindowMonths);

  // Process in pages to avoid loading 100k accounts in memory.
  const PAGE_SIZE = 500;
  let cursor: string | undefined;
  let accountsChecked = 0;
  let tiersChanged = 0;

  while (true) {
    const page: { id: string; userId: string; currentTier: import('@prisma/client').LoyaltyTier }[] =
      await prisma.loyaltyAccount.findMany({
        take: PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: 'asc' },
        select: { id: true, userId: true, currentTier: true },
      });
    if (page.length === 0) break;

    const userIds = page.map((a) => a.userId);
    // Aggregate-by-user spend in one query rather than N round-trips.
    const spendByUser = await prisma.order.groupBy({
      by: ['userId'],
      where: {
        userId: { in: userIds },
        status: 'PAID',
        createdAt: { gte: windowStart },
      },
      _sum: { subtotal: true },
    });
    const spendMap = new Map<string, number>(
      spendByUser.map((row) => [row.userId, row._sum.subtotal ?? 0]),
    );

    for (const account of page) {
      accountsChecked += 1;
      const spend = spendMap.get(account.userId) ?? 0;
      const newTier = tierForSpend(spend, cfg);
      if (newTier !== account.currentTier) {
        await prisma.loyaltyAccount.update({
          where: { id: account.id },
          data: { currentTier: newTier },
        });
        tiersChanged += 1;
        logger.info('loyalty.cron.tier_changed', {
          accountId: account.id,
          from: account.currentTier,
          to: newTier,
          rollingSpend: spend,
        });
      }
    }

    cursor = page[page.length - 1].id;
    if (page.length < PAGE_SIZE) break;
  }

  return { accountsChecked, tiersChanged };
}

async function sweep(): Promise<void> {
  if (sweeping) {
    logger.info('loyalty.cron.sweep_skipped_already_running');
    return;
  }
  sweeping = true;
  const startedAt = Date.now();
  try {
    const expiry = await expireOverdueCoins();
    const tiers = await recomputeAllTiers();
    logger.info('loyalty.cron.sweep_complete', {
      durationMs: Date.now() - startedAt,
      coinsExpired: expiry.coinsExpired,
      accountsExpired: expiry.accountsTouched,
      accountsChecked: tiers.accountsChecked,
      tiersChanged: tiers.tiersChanged,
    });
  } catch (err) {
    logger.error('loyalty.cron.sweep_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    sweeping = false;
  }
}

export function startLoyaltyMaintenanceCron(): void {
  setTimeout(() => void sweep(), STARTUP_DELAY_MS);
  setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
  logger.info('loyalty.cron.started', {
    intervalMs: SWEEP_INTERVAL_MS,
    startupDelayMs: STARTUP_DELAY_MS,
  });
}
