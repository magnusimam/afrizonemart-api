import type { Response } from 'express';
import { LoyaltyTier } from '@prisma/client';
import type { AuthedRequest } from '@/middleware/auth';
import { HttpError } from '@/middleware/error-handler';
import { prisma } from '@/infra/prisma';
import { getLoyaltyConfig, type LoyaltyConfigSnapshot } from './service';

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

  const tierProgress = computeTierProgress(account.currentTier, rollingSpend, cfg);

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
    tierProgress,
    config: publicConfig(cfg),
  });
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
