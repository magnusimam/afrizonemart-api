import type { Response } from 'express';
import { LoyaltyTier, LoyaltyTransactionType } from '@prisma/client';
import type { AuthedRequest } from '@/middleware/auth';
import { HttpError } from '@/middleware/error-handler';
import { prisma } from '@/infra/prisma';
import { getLoyaltyConfig, type LoyaltyConfigSnapshot } from './service';
import {
  getOrCreateRefereeCoupon,
  getReferralSummary,
} from './referral.service';

/// GET /api/loyalty/me
///
/// Returns the authenticated user's loyalty state — current tier,
/// coin balance, lifetime totals, recent ledger entries, and the
/// progress-to-next-tier figures so the customer dashboard can
/// render a progress bar without computing it client-side.
///
/// Returns 200 with `enrolled: false` if the user hasn't placed a
/// paid order yet. Customer dashboard renders a "make your first
/// purchase to start earning" tile in that case.
export async function getMyLoyaltyHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const userId = req.user.id;

  const account = await prisma.loyaltyAccount.findUnique({
    where: { userId },
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 25,
      },
    },
  });

  const cfg = await getLoyaltyConfig();

  if (!account) {
    // Not enrolled yet — surface the program rules so the
    // dashboard can render a teaser.
    res.json({
      enrolled: false,
      config: publicConfig(cfg),
    });
    return;
  }

  // Progress to next tier — what's the customer's rolling-window
  // spend right now, and how much more until they hit the next
  // tier? Read the same window the earn flow uses.
  const windowStart = new Date();
  windowStart.setMonth(windowStart.getMonth() - cfg.spendWindowMonths);
  const spendRows = await prisma.order.findMany({
    where: {
      userId,
      status: 'PAID',
      createdAt: { gte: windowStart },
    },
    select: { subtotal: true },
  });
  const rollingSpend = spendRows.reduce((sum, r) => sum + r.subtotal, 0);
  /// 2026-05-16 — Phase 1 gamification: storefront uses the count to
  /// project "how many more orders to reach next tier" from the
  /// customer's actual average order value.
  const rollingPaidOrders = spendRows.length;

  const tierProgress = computeTierProgress(account.currentTier, rollingSpend, cfg);

  /// 2026-05-16 — surface the soonest-expiring coin batch so the
  /// storefront can render a "30 coins expire on July 15" urgency
  /// banner. Reads positive EARN / WELCOME_BONUS / REDEEM_REFUND /
  /// positive-ADMIN_ADJUSTMENT rows with an expiresAt in the next
  /// 30 days. Sums the rows that all expire on the same earliest
  /// date so a customer who earned 12 coins three weeks ago and
  /// 18 coins two weeks ago sees one banner per expiry date, not
  /// two. Null when nothing is expiring soon.
  const expiring = await soonestExpiringBatch(account.id);

  res.json({
    enrolled: true,
    account: {
      id: account.id,
      coinBalance: account.coinBalance,
      currentTier: account.currentTier,
      lifetimeCoinsEarned: account.lifetimeCoinsEarned,
      lifetimeCoinsRedeemed: account.lifetimeCoinsRedeemed,
      enrolledAt: account.enrolledAt,
    },
    transactions: account.transactions,
    rollingSpend,
    rollingPaidOrders,
    tierProgress,
    expiring,
    config: publicConfig(cfg),
  });
}

const EXPIRY_WARN_WINDOW_DAYS = 30;
const POSITIVE_DELTA_TYPES: LoyaltyTransactionType[] = [
  LoyaltyTransactionType.EARN,
  LoyaltyTransactionType.WELCOME_BONUS,
  LoyaltyTransactionType.REDEEM_REFUND,
  LoyaltyTransactionType.ADMIN_ADJUSTMENT,
];

async function soonestExpiringBatch(
  accountId: string,
): Promise<{ coins: number; expiresAt: string } | null> {
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + EXPIRY_WARN_WINDOW_DAYS);
  /// Pull the SOONEST row, then sum every row that shares that
  /// expiresAt timestamp (rare — most batches differ — but the
  /// daily-cron-grouped EXPIRY logic is forgiving).
  const soonest = await prisma.loyaltyTransaction.findFirst({
    where: {
      accountId,
      type: { in: POSITIVE_DELTA_TYPES },
      delta: { gt: 0 },
      expiresAt: { not: null, lte: horizon, gt: new Date() },
    },
    orderBy: { expiresAt: 'asc' },
    select: { expiresAt: true },
  });
  if (!soonest?.expiresAt) return null;

  const sameDay = await prisma.loyaltyTransaction.aggregate({
    where: {
      accountId,
      type: { in: POSITIVE_DELTA_TYPES },
      delta: { gt: 0 },
      expiresAt: soonest.expiresAt,
    },
    _sum: { delta: true },
  });
  const coins = sameDay._sum?.delta ?? 0;
  if (coins <= 0) return null;
  return {
    coins,
    expiresAt: soonest.expiresAt.toISOString(),
  };
}

/// Strip out the admin-facing knobs from the config so the public
/// endpoint only exposes what customers need: their coin's value,
/// the tier thresholds (so they can see how close they are), and
/// the redeem rules.
function publicConfig(cfg: LoyaltyConfigSnapshot) {
  return {
    coinValueNgn: cfg.coinValueNgn,
    welcomeBonusCoins: cfg.welcomeBonusCoins,
    maxOrderRedeemPercent: cfg.maxOrderRedeemPercent,
    minRedeemCoins: cfg.minRedeemCoins,
    coinExpiryMonths: cfg.coinExpiryMonths,
    spendWindowMonths: cfg.spendWindowMonths,
    tier2GoldThreshold: cfg.tier2GoldThreshold,
    tier3VipThreshold: cfg.tier3VipThreshold,
    tier4AmbassadorThreshold: cfg.tier4AmbassadorThreshold,
    tier5DorimeThreshold: cfg.tier5DorimeThreshold,
    /// 2026-05-16 Phase 2 — perk knobs surfaced to the storefront
    /// so the PerksLadder shows live values when admin tunes them.
    birthdayBonusBlue: cfg.birthdayBonusBlue,
    birthdayBonusGold: cfg.birthdayBonusGold,
    birthdayBonusVip: cfg.birthdayBonusVip,
    birthdayBonusAmbassador: cfg.birthdayBonusAmbassador,
    birthdayBonusDorime: cfg.birthdayBonusDorime,
    referralCapBlue: cfg.referralCapBlue,
    referralCapGold: cfg.referralCapGold,
    referralCapVip: cfg.referralCapVip,
    referralCapAmbassador: cfg.referralCapAmbassador,
    referralCapDorime: cfg.referralCapDorime,
    referralPercent: cfg.referralPercent,
    referralHoldDays: cfg.referralHoldDays,
    refereeCouponNgn: cfg.refereeCouponNgn,
  };
}

interface TierProgress {
  currentTier: LoyaltyTier;
  /// Next tier the customer is progressing toward, or null if they
  /// are already at the top tier (Dorime).
  nextTier: LoyaltyTier | null;
  /// NGN amount they need to spend (in the rolling window) before
  /// they qualify for the next tier. 0 when already at the top.
  ngnUntilNextTier: number;
  /// 0-100 percentage of the way to the next tier. Always 100
  /// when at the top so the progress bar shows full.
  percentToNextTier: number;
}

function computeTierProgress(
  currentTier: LoyaltyTier,
  rollingSpend: number,
  cfg: LoyaltyConfigSnapshot,
): TierProgress {
  const ladder: Array<{ tier: LoyaltyTier; min: number }> = [
    { tier: LoyaltyTier.BLUE, min: 0 },
    { tier: LoyaltyTier.GOLD, min: cfg.tier2GoldThreshold },
    { tier: LoyaltyTier.VIP, min: cfg.tier3VipThreshold },
    { tier: LoyaltyTier.AMBASSADOR, min: cfg.tier4AmbassadorThreshold },
    { tier: LoyaltyTier.DORIME, min: cfg.tier5DorimeThreshold },
  ];
  const idx = ladder.findIndex((t) => t.tier === currentTier);
  if (idx === ladder.length - 1) {
    return {
      currentTier,
      nextTier: null,
      ngnUntilNextTier: 0,
      percentToNextTier: 100,
    };
  }
  const next = ladder[idx + 1];
  const floor = ladder[idx].min;
  const ngnUntilNextTier = Math.max(0, next.min - rollingSpend);
  const span = next.min - floor;
  const inSpan = Math.min(span, Math.max(0, rollingSpend - floor));
  const percentToNextTier =
    span > 0 ? Math.round((inSpan / span) * 100) : 100;
  return {
    currentTier,
    nextTier: next.tier,
    ngnUntilNextTier,
    percentToNextTier,
  };
}

/// GET /api/loyalty/referral-summary
/// 2026-05-16 Phase 2 — powers the /account/refer page. Returns the
/// customer's referral code (lazy-generated if absent), counts of
/// pending/scheduled/paid referrals, and the live cap + percent +
/// hold from the config so the page copy stays accurate when admin
/// tunes the knobs.
export async function getReferralSummaryHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  res.json(await getReferralSummary(req.user.id));
}

/// GET /api/loyalty/referral-coupon
/// Returns the referee's one-time welcome coupon (₦500 off first
/// order). Lazy-created — first call generates the row, subsequent
/// calls return the same code. 404 if the user isn't a referee.
export async function getRefereeCouponHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const coupon = await getOrCreateRefereeCoupon(req.user.id);
  if (!coupon) {
    throw HttpError.notFound('No referee coupon available for this account.');
  }
  res.json(coupon);
}
