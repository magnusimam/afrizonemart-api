import { randomBytes } from 'node:crypto';
import {
  LoyaltyTransactionType,
  ReferralStatus,
  type LoyaltyTier,
} from '@prisma/client';
import { eventBus } from '@/infra/eventBus';
import { logger } from '@/infra/logger';
import { prisma } from '@/infra/prisma';
import {
  applyLoyaltyTransaction,
  getLoyaltyConfig,
  getOrCreateAccountForUser,
  referralCapForTier,
  type LoyaltyConfigSnapshot,
} from './service';

/**
 * 2026-05-16 — Phase 2 referral system.
 *
 * Design (Magnus' redlines applied):
 *  - Referee gets a coupon (₦500 off first order) at signup —
 *    generated lazily by `getOrCreateRefereeCoupon` here.
 *  - Referrer's coin payout is gated on the referee placing a
 *    FIRST PAID ORDER, not on signup. Coins are scheduled with a
 *    14-day hold so the refund window clears before crediting.
 *  - Per-month cap (`maxReferralsPerMonth`) checked at payout
 *    time, not signup, so spam signups don't block a real referrer
 *    — they just don't pay out.
 *  - Self-referral, duplicate email/phone blocked at attribution.
 *  - Payout cap scales with referrer's CURRENT tier
 *    (`referralCapForTier`). Computed: `ceil(refereeFirstOrderSubtotal
 *    * referralPercent / 100)`, then min'd against the cap.
 *
 * All ledger writes go through `applyLoyaltyTransaction` (the only
 * `LoyaltyTransaction` writer in the codebase). Idempotent on
 * `Referral.status` transitions: PAYOUT_SCHEDULED → PAID_OUT only
 * once; refund reversal flips PENDING/PAYOUT_SCHEDULED → REVERSED.
 */

const REFERRAL_CODE_BYTES = 6; // 12 hex chars — collision-resistant at any realistic scale

/// Generate a stable referral slug. Retries on the (extremely rare)
/// collision against `User.referralCode`.
export async function generateReferralCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const candidate = randomBytes(REFERRAL_CODE_BYTES)
      .toString('hex')
      .slice(0, 10);
    const clash = await prisma.user.findUnique({
      where: { referralCode: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  throw new Error('referral code generation: too many collisions');
}

/// Ensure every existing User has a referralCode. Called lazily
/// (on /api/loyalty/referral-link) so legacy accounts get one the
/// first time they visit the refer-a-friend page.
export async function ensureReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (!user) throw new Error('user not found');
  if (user.referralCode) return user.referralCode;
  const code = await generateReferralCode();
  await prisma.user.update({
    where: { id: userId },
    data: { referralCode: code },
  });
  return code;
}

interface AttributeInput {
  refereeUserId: string;
  refereeEmail: string;
  refereePhone?: string | null;
  referralCode: string;
}

/// Called by the auth register flow when ?ref=<code> was on signup.
/// Returns a status object so the caller (auth controller) can log
/// the attribution result. Silently no-ops on invalid codes —
/// signup should never fail because of a bad ref.
export async function attributeSignupReferral(
  input: AttributeInput,
): Promise<{ attributed: boolean; reason?: string }> {
  try {
    const referrer = await prisma.user.findUnique({
      where: { referralCode: input.referralCode.trim().toLowerCase() },
      select: { id: true, email: true, phone: true },
    });
    if (!referrer) {
      return { attributed: false, reason: 'unknown_code' };
    }
    /// Self-referral block — same user id (paranoid; shouldn't happen
    /// since the referee row was just created, but kept for safety).
    if (referrer.id === input.refereeUserId) {
      return { attributed: false, reason: 'self_referral_userid' };
    }
    /// Same email or phone → likely the same human spinning up a
    /// burner. Both are unique columns on User but the burner could
    /// use different email + different phone; this check just blocks
    /// the obvious case.
    if (referrer.email.toLowerCase() === input.refereeEmail.toLowerCase()) {
      return { attributed: false, reason: 'self_referral_email' };
    }
    if (
      input.refereePhone &&
      referrer.phone &&
      referrer.phone === input.refereePhone
    ) {
      return { attributed: false, reason: 'self_referral_phone' };
    }
    /// Don't double-attribute — referrer can use multiple codes
    /// over time but a referee can only ever have one
    /// `referredByUserId`.
    const existing = await prisma.referral.findUnique({
      where: { refereeUserId: input.refereeUserId },
      select: { id: true },
    });
    if (existing) {
      return { attributed: false, reason: 'already_attributed' };
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id: input.refereeUserId },
        data: { referredByUserId: referrer.id },
      }),
      prisma.referral.create({
        data: {
          referrerUserId: referrer.id,
          refereeUserId: input.refereeUserId,
          referralCode: input.referralCode.trim().toLowerCase(),
          status: ReferralStatus.PENDING,
        },
      }),
    ]);
    logger.info('referral.attributed', {
      referrerId: referrer.id,
      refereeId: input.refereeUserId,
      code: input.referralCode,
    });
    return { attributed: true };
  } catch (err) {
    /// Never throw — signup must always succeed; missed attribution
    /// is recoverable, broken signup isn't.
    logger.warn('referral.attribute_failed', {
      refereeId: input.refereeUserId,
      code: input.referralCode,
      error: err instanceof Error ? err.message : String(err),
    });
    return { attributed: false, reason: 'exception' };
  }
}

/// Called by the loyalty subscriber on `order.paid`. If this is the
/// referee's first paid order AND a PENDING Referral exists, flip
/// it to PAYOUT_SCHEDULED with the computed coin amount + hold-clear
/// date. The cron pays out later.
///
/// Idempotent: order.paid can fire from multiple sources
/// (webhook / verify-redirect / admin); a referral that's already
/// past PENDING is a no-op.
export async function scheduleReferralPayoutIfEligible(
  orderId: string,
): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      userId: true,
      subtotal: true,
      createdAt: true,
    },
  });
  if (!order) return;

  const referral = await prisma.referral.findUnique({
    where: { refereeUserId: order.userId },
    include: {
      referrer: {
        include: {
          loyaltyAccount: { select: { currentTier: true } },
        },
      },
    },
  });
  if (!referral || referral.status !== ReferralStatus.PENDING) return;

  /// Make sure this is genuinely the FIRST paid order. If the
  /// referee has earlier paid orders we shouldn't pay out (could
  /// have happened if the referral row was backfilled after the
  /// fact, or the event re-fires).
  const earlier = await prisma.order.findFirst({
    where: {
      userId: order.userId,
      status: 'PAID',
      createdAt: { lt: order.createdAt },
    },
    select: { id: true },
  });
  if (earlier) {
    logger.info('referral.skip_not_first_order', {
      refereeId: order.userId,
      orderId,
    });
    return;
  }

  const cfg = await getLoyaltyConfig();
  const refTier: LoyaltyTier =
    referral.referrer.loyaltyAccount?.currentTier ?? 'BLUE';
  const cap = referralCapForTier(refTier, cfg);
  const earned = Math.min(
    cap,
    Math.ceil((order.subtotal * cfg.referralPercent) / 100),
  );

  const scheduledPayoutAt = new Date();
  scheduledPayoutAt.setDate(
    scheduledPayoutAt.getDate() + cfg.referralHoldDays,
  );

  await prisma.referral.update({
    where: { id: referral.id },
    data: {
      status: ReferralStatus.PAYOUT_SCHEDULED,
      firstPaidOrderId: order.id,
      firstPaidOrderAt: order.createdAt,
      scheduledCoinPayout: earned,
      scheduledPayoutAt,
    },
  });
  logger.info('referral.payout_scheduled', {
    referralId: referral.id,
    referrerId: referral.referrerUserId,
    refereeId: order.userId,
    coins: earned,
    payoutAt: scheduledPayoutAt.toISOString(),
  });
}

/// Called by the loyalty subscriber on `order.refunded`. If the
/// refunded order is the referee's `firstPaidOrderId` AND the
/// referral is still PAYOUT_SCHEDULED (hold window not yet
/// cleared), reverse it without paying. If already PAID_OUT, the
/// existing loyalty.refund clawback handles the coin reversal.
export async function reverseReferralIfStillHeld(orderId: string): Promise<void> {
  const referral = await prisma.referral.findFirst({
    where: {
      firstPaidOrderId: orderId,
      status: ReferralStatus.PAYOUT_SCHEDULED,
    },
  });
  if (!referral) return;
  await prisma.referral.update({
    where: { id: referral.id },
    data: {
      status: ReferralStatus.REVERSED,
      reversedAt: new Date(),
    },
  });
  logger.info('referral.reversed_held', {
    referralId: referral.id,
    refundedOrderId: orderId,
  });
}

/// Daily cron sweep — pay out every PAYOUT_SCHEDULED row whose
/// scheduledPayoutAt has passed, subject to the per-month cap.
/// Called from `loyalty/cron.ts` inside the daily sweep so we don't
/// need a second cron heartbeat.
export async function runReferralPayouts(): Promise<{
  paid: number;
  capped: number;
  errored: number;
}> {
  const cfg = await getLoyaltyConfig();
  const now = new Date();
  const due = await prisma.referral.findMany({
    where: {
      status: ReferralStatus.PAYOUT_SCHEDULED,
      scheduledPayoutAt: { lte: now },
    },
    orderBy: { scheduledPayoutAt: 'asc' },
    take: 200,
  });
  if (due.length === 0) return { paid: 0, capped: 0, errored: 0 };

  let paid = 0;
  let capped = 0;
  let errored = 0;

  for (const r of due) {
    try {
      /// Per-month cap: count successful PAID_OUT referrals for the
      /// referrer in the calendar month of `now`. Capped referrals
      /// get REVERSED rather than queued — the customer can earn
      /// more next month.
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const paidThisMonth = await prisma.referral.count({
        where: {
          referrerUserId: r.referrerUserId,
          status: ReferralStatus.PAID_OUT,
          paidOutAt: { gte: monthStart },
        },
      });
      if (paidThisMonth >= cfg.maxReferralsPerMonth) {
        await prisma.referral.update({
          where: { id: r.id },
          data: { status: ReferralStatus.REVERSED, reversedAt: now },
        });
        capped += 1;
        continue;
      }

      const account = await getOrCreateAccountForUser(r.referrerUserId);
      const cfgExpiry = new Date();
      cfgExpiry.setMonth(cfgExpiry.getMonth() + cfg.coinExpiryMonths);
      const tx = await applyLoyaltyTransaction({
        accountId: account.id,
        delta: r.scheduledCoinPayout ?? 0,
        type: LoyaltyTransactionType.ADMIN_ADJUSTMENT,
        causeAdminId: null,
        reason: `Referral payout: referred user ${r.refereeUserId.slice(-6)}`,
        expiresAt: cfgExpiry,
      });
      await prisma.referral.update({
        where: { id: r.id },
        data: {
          status: ReferralStatus.PAID_OUT,
          paidOutAt: now,
          payoutTransactionId: tx.id,
        },
      });
      paid += 1;
      /// Notify-on-the-event-bus so the notifications dispatcher
      /// can email the referrer ("You earned X coins for referring
      /// a friend"). Wired in Wave 2 if Magnus wants a dedicated
      /// template — fires regardless so future subscribers can pick
      /// up the signal.
      await eventBus.emit('referral.paid_out', {
        referralId: r.id,
        referrerUserId: r.referrerUserId,
        refereeUserId: r.refereeUserId,
        coins: r.scheduledCoinPayout ?? 0,
      });
    } catch (err) {
      errored += 1;
      logger.warn('referral.payout_failed', {
        referralId: r.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info('referral.payouts_complete', { paid, capped, errored });
  return { paid, capped, errored };
}

/// Look up (and lazily create) the welcome coupon for a referee.
/// Returns the coupon code as a string. Used at signup-success
/// time + on the referee's first checkout if they haven't applied
/// it yet.
export async function getOrCreateRefereeCoupon(
  refereeUserId: string,
): Promise<{ code: string; valueNgn: number; expiresAt: Date } | null> {
  const referral = await prisma.referral.findUnique({
    where: { refereeUserId },
  });
  if (!referral) return null;

  const cfg = await getLoyaltyConfig();
  const couponCode = `REF-${refereeUserId.slice(-6).toUpperCase()}`;

  const existing = await prisma.coupon.findUnique({ where: { code: couponCode } });
  if (existing) {
    return {
      code: existing.code,
      valueNgn: existing.valueAmount ?? cfg.refereeCouponNgn,
      expiresAt: existing.endsAt ?? new Date(Date.now() + cfg.refereeCouponValidDays * 86_400_000),
    };
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + cfg.refereeCouponValidDays);
  await prisma.coupon.create({
    data: {
      code: couponCode,
      description: `Welcome from a friend — ₦${cfg.refereeCouponNgn} off your first order`,
      type: 'FIXED_CART',
      valueAmount: cfg.refereeCouponNgn,
      maxUses: 1,
      maxUsesPerCustomer: 1,
      isActive: true,
      endsAt: expiresAt,
    },
  });
  return {
    code: couponCode,
    valueNgn: cfg.refereeCouponNgn,
    expiresAt,
  };
}

/// Helper exposed for /api/loyalty/referral-summary on the storefront.
export async function getReferralSummary(userId: string): Promise<{
  code: string;
  totalReferred: number;
  pending: number;
  scheduled: number;
  paidOut: number;
  totalCoinsEarned: number;
  capPerReferral: number;
  percentOfFirstOrder: number;
  holdDays: number;
}> {
  const code = await ensureReferralCode(userId);
  const cfg = await getLoyaltyConfig();
  const myReferrals = await prisma.referral.findMany({
    where: { referrerUserId: userId },
    select: { status: true, scheduledCoinPayout: true },
  });
  let pending = 0;
  let scheduled = 0;
  let paidOut = 0;
  let totalCoinsEarned = 0;
  for (const r of myReferrals) {
    if (r.status === ReferralStatus.PENDING) pending += 1;
    if (r.status === ReferralStatus.PAYOUT_SCHEDULED) scheduled += 1;
    if (r.status === ReferralStatus.PAID_OUT) {
      paidOut += 1;
      totalCoinsEarned += r.scheduledCoinPayout ?? 0;
    }
  }
  /// Cap shown to the customer uses their current tier.
  const account = await prisma.loyaltyAccount.findUnique({
    where: { userId },
    select: { currentTier: true },
  });
  const tier: LoyaltyTier = account?.currentTier ?? 'BLUE';
  return {
    code,
    totalReferred: myReferrals.length,
    pending,
    scheduled,
    paidOut,
    totalCoinsEarned,
    capPerReferral: referralCapForTier(tier, cfg),
    percentOfFirstOrder: cfg.referralPercent,
    holdDays: cfg.referralHoldDays,
  };
}

/// Birthday-bonus cron sweep. Awards `birthdayBonusForTier` coins
/// to every account whose User.birthDate matches today (UTC). Once
/// per calendar year per user — guarded by a marker
/// ADMIN_ADJUSTMENT row with a stable reason string.
export async function runBirthdayBonusSweep(): Promise<{
  awarded: number;
  skipped: number;
  errored: number;
}> {
  const today = new Date();
  const month = today.getUTCMonth() + 1;
  const day = today.getUTCDate();
  const year = today.getUTCFullYear();
  /// Postgres-side date-part filter. Birthdays are stored as full
  /// timestamps but only month + day matter.
  const users: { id: string; birthDate: Date | null; loyaltyAccount: { id: string; currentTier: LoyaltyTier } | null }[] =
    await prisma.user.findMany({
      where: {
        birthDate: { not: null },
        loyaltyAccount: { isNot: null },
      },
      select: {
        id: true,
        birthDate: true,
        loyaltyAccount: { select: { id: true, currentTier: true } },
      },
    });

  const cfg = await getLoyaltyConfig();
  let awarded = 0;
  let skipped = 0;
  let errored = 0;
  const reasonForYear = `Birthday bonus ${year}`;
  for (const u of users) {
    if (!u.birthDate || !u.loyaltyAccount) continue;
    if (u.birthDate.getUTCMonth() + 1 !== month) continue;
    if (u.birthDate.getUTCDate() !== day) continue;
    try {
      /// Idempotency: a birthday-bonus row for this account this
      /// year already exists?
      const already = await prisma.loyaltyTransaction.findFirst({
        where: {
          accountId: u.loyaltyAccount.id,
          type: LoyaltyTransactionType.ADMIN_ADJUSTMENT,
          reason: reasonForYear,
        },
        select: { id: true },
      });
      if (already) {
        skipped += 1;
        continue;
      }
      const amount = birthdayAmountForTier(u.loyaltyAccount.currentTier, cfg);
      if (amount <= 0) {
        skipped += 1;
        continue;
      }
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + cfg.coinExpiryMonths);
      await applyLoyaltyTransaction({
        accountId: u.loyaltyAccount.id,
        delta: amount,
        type: LoyaltyTransactionType.ADMIN_ADJUSTMENT,
        causeAdminId: null,
        reason: reasonForYear,
        expiresAt,
      });
      awarded += 1;
    } catch (err) {
      errored += 1;
      logger.warn('loyalty.birthday.bonus_failed', {
        userId: u.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  logger.info('loyalty.birthday.sweep_complete', { awarded, skipped, errored });
  return { awarded, skipped, errored };
}

function birthdayAmountForTier(
  tier: LoyaltyTier,
  cfg: LoyaltyConfigSnapshot,
): number {
  switch (tier) {
    case 'BLUE': return cfg.birthdayBonusBlue;
    case 'GOLD': return cfg.birthdayBonusGold;
    case 'VIP': return cfg.birthdayBonusVip;
    case 'AMBASSADOR': return cfg.birthdayBonusAmbassador;
    case 'DORIME': return cfg.birthdayBonusDorime;
    default: return 0;
  }
}
