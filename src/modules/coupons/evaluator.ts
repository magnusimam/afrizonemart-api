import type { Coupon } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';

export interface CouponEvaluation {
  coupon: Coupon;
  /** Discount applied to the cart subtotal (Naira whole units). */
  cartDiscount: number;
  /** Whether shipping should be free regardless of zone rate. */
  freeShipping: boolean;
}

interface EvaluateInput {
  code: string;
  userId: string;
  subtotal: number;
}

/**
 * Validate a coupon code against the current cart context. Throws
 * HttpError with a customer-friendly message on any rejection.
 */
export async function evaluateCoupon(input: EvaluateInput): Promise<CouponEvaluation> {
  const code = input.code.trim().toUpperCase();
  const coupon = await prisma.coupon.findUnique({ where: { code } });
  if (!coupon || !coupon.isActive) {
    throw HttpError.badRequest('That coupon code is not valid.');
  }

  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) {
    throw HttpError.badRequest('This coupon is not active yet.');
  }
  if (coupon.endsAt && coupon.endsAt < now) {
    throw HttpError.badRequest('This coupon has expired.');
  }

  if (coupon.minSubtotal && input.subtotal < coupon.minSubtotal) {
    throw HttpError.badRequest(
      `This coupon needs a cart subtotal of at least ₦${coupon.minSubtotal.toLocaleString()}.`,
    );
  }

  if (coupon.maxUses != null && coupon.usageCount >= coupon.maxUses) {
    throw HttpError.badRequest('This coupon has reached its usage limit.');
  }

  if (coupon.maxUsesPerCustomer != null) {
    const personalUses = await prisma.couponRedemption.count({
      where: { couponId: coupon.id, userId: input.userId },
    });
    if (personalUses >= coupon.maxUsesPerCustomer) {
      throw HttpError.badRequest(
        `You've already used this coupon ${personalUses} time${personalUses === 1 ? '' : 's'}.`,
      );
    }
  }

  /// 2026-05-16 Phase 2 — tier-gated coupons. When admin sets a
  /// `requiredTier` on the coupon, only customers whose loyalty tier
  /// is at or above that level can apply it. Compared by ordinal so
  /// "VIP-and-above" is a single setting.
  if (coupon.requiredTier) {
    const account = await prisma.loyaltyAccount.findUnique({
      where: { userId: input.userId },
      select: { currentTier: true },
    });
    const ranks = ['BLUE', 'GOLD', 'VIP', 'AMBASSADOR', 'DORIME'];
    const haveRank = ranks.indexOf(account?.currentTier ?? 'BLUE');
    const needRank = ranks.indexOf(coupon.requiredTier);
    if (haveRank < needRank) {
      throw HttpError.badRequest(
        `This coupon is reserved for Continental ${coupon.requiredTier.toLowerCase()} members and above.`,
      );
    }
  }

  return computeDiscount(coupon, input.subtotal);
}

/**
 * Pure computation — no DB calls. Used both by `evaluateCoupon` and by
 * `placeOrder` after re-validation, so the math stays in one place.
 */
export function computeDiscount(coupon: Coupon, subtotal: number): CouponEvaluation {
  switch (coupon.type) {
    case 'PERCENT_CART': {
      const pct = coupon.valuePercent ?? 0;
      const cartDiscount = Math.min(subtotal, Math.round((subtotal * pct) / 100));
      return { coupon, cartDiscount, freeShipping: false };
    }
    case 'FIXED_CART': {
      const cartDiscount = Math.min(subtotal, coupon.valueAmount ?? 0);
      return { coupon, cartDiscount, freeShipping: false };
    }
    case 'FREE_SHIPPING':
      return { coupon, cartDiscount: 0, freeShipping: true };
  }
}
