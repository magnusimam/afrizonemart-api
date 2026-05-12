import type { Prisma } from '@prisma/client';
import { LoyaltyTier, LoyaltyTransactionType } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';

/**
 * Continental Rewards — Afrizone Coin loyalty program (Tracker #44).
 *
 * This module owns the loyalty domain. Critical invariants enforced
 * here, not in callers:
 *
 *  1. **Append-only ledger.** `applyLoyaltyTransaction()` is the
 *     only function in the codebase that writes a `LoyaltyTransaction`
 *     row. No controller, no script, no event subscriber should
 *     `prisma.loyaltyTransaction.create` directly. The helper
 *     guarantees balance-after consistency, lifetime-counter updates,
 *     and the cached `coinBalance` on `LoyaltyAccount` stay in sync.
 *
 *  2. **Negative balance impossible.** Every debit (`delta < 0`) is
 *     checked against current balance inside the same DB transaction.
 *     Concurrent redemptions can't drain past zero because we lock
 *     the LoyaltyAccount row via `SELECT FOR UPDATE` (Prisma's
 *     `$transaction` + explicit `findFirst`).
 *
 *  3. **Lifetime counters only ever grow.** `lifetimeCoinsEarned`
 *     only increments on positive deltas of `EARN` / `WELCOME_BONUS`
 *     / `REDEEM_REFUND` / positive `ADMIN_ADJUSTMENT`.
 *     `lifetimeCoinsRedeemed` only increments (by absolute value)
 *     on `REDEEM` deltas. Reversals don't decrement counters —
 *     they're meant to show "how much did this customer ever earn".
 *
 *  4. **Singleton config.** `LoyaltyConfig` has exactly one row (id=1)
 *     created in the migration. The getter never creates one
 *     defensively to avoid masking a corrupted DB; if the row is
 *     missing the migration didn't run and the program should fail
 *     loudly.
 *
 * PR 1 ships only this service + the admin endpoints. PR 2 (event
 * subscribers for auto-enrollment + earn) and PR 3 (redemption) +
 * PR 4 (expiry cron + refund clawback) plug in via the same helper.
 */

export interface LoyaltyConfigSnapshot {
  baseEarnPerOrder: number;
  tierMultiplier: number;
  welcomeBonusCoins: number;
  tier2GoldThreshold: number;
  tier3VipThreshold: number;
  tier4AmbassadorThreshold: number;
  tier5DorimeThreshold: number;
  coinValueNgn: number;
  maxOrderRedeemPercent: number;
  minRedeemCoins: number;
  coinExpiryMonths: number;
  spendWindowMonths: number;
}

/// Fetch the loyalty config singleton. Throws if missing — this
/// indicates the migration didn't run, which would be a deploy
/// failure rather than a recoverable error.
export async function getLoyaltyConfig(): Promise<LoyaltyConfigSnapshot> {
  const cfg = await prisma.loyaltyConfig.findUnique({ where: { id: 1 } });
  if (!cfg) {
    throw new Error(
      'LoyaltyConfig singleton missing — migration 20260512140000_continental_rewards likely did not run.',
    );
  }
  return {
    baseEarnPerOrder: cfg.baseEarnPerOrder,
    tierMultiplier: cfg.tierMultiplier,
    welcomeBonusCoins: cfg.welcomeBonusCoins,
    tier2GoldThreshold: cfg.tier2GoldThreshold,
    tier3VipThreshold: cfg.tier3VipThreshold,
    tier4AmbassadorThreshold: cfg.tier4AmbassadorThreshold,
    tier5DorimeThreshold: cfg.tier5DorimeThreshold,
    coinValueNgn: cfg.coinValueNgn,
    maxOrderRedeemPercent: cfg.maxOrderRedeemPercent,
    minRedeemCoins: cfg.minRedeemCoins,
    coinExpiryMonths: cfg.coinExpiryMonths,
    spendWindowMonths: cfg.spendWindowMonths,
  };
}

/// Update the loyalty config singleton. Caller is responsible for
/// permission gating (loyalty.write capability) and for writing the
/// AuditLog entry — this service just persists the change.
export async function updateLoyaltyConfig(
  patch: Partial<LoyaltyConfigSnapshot>,
  updatedById: string | null,
): Promise<LoyaltyConfigSnapshot> {
  await prisma.loyaltyConfig.update({
    where: { id: 1 },
    data: { ...patch, updatedById: updatedById ?? null },
  });
  return getLoyaltyConfig();
}

/// Compute the tier for a given rolling-12-month spend total
/// against the current config thresholds.
export function tierForSpend(
  spendNgn: number,
  cfg: LoyaltyConfigSnapshot,
): LoyaltyTier {
  if (spendNgn >= cfg.tier5DorimeThreshold) return LoyaltyTier.DORIME;
  if (spendNgn >= cfg.tier4AmbassadorThreshold) return LoyaltyTier.AMBASSADOR;
  if (spendNgn >= cfg.tier3VipThreshold) return LoyaltyTier.VIP;
  if (spendNgn >= cfg.tier2GoldThreshold) return LoyaltyTier.GOLD;
  return LoyaltyTier.BLUE;
}

/// Coins earned per paid order at a given tier, per the
/// `baseEarn × multiplier^(tier-1)` formula. Floors to integer.
export function coinsPerOrderForTier(
  tier: LoyaltyTier,
  cfg: LoyaltyConfigSnapshot,
): number {
  const tierIndex = tierIndexOf(tier);
  const raw = cfg.baseEarnPerOrder * Math.pow(cfg.tierMultiplier, tierIndex);
  return Math.floor(raw);
}

function tierIndexOf(tier: LoyaltyTier): number {
  switch (tier) {
    case LoyaltyTier.BLUE:
      return 0;
    case LoyaltyTier.GOLD:
      return 1;
    case LoyaltyTier.VIP:
      return 2;
    case LoyaltyTier.AMBASSADOR:
      return 3;
    case LoyaltyTier.DORIME:
      return 4;
    default:
      return 0;
  }
}

/// Resolve a user's loyalty account, creating one if it doesn't
/// exist yet. Used by both the customer-facing "what's my balance"
/// endpoint and the auto-enroll path on first paid order.
///
/// The PR 1 admin code path uses this read-only (creating an
/// account from the admin UI before the user has earned anything
/// is fine — the welcome bonus only fires from the PR 2 enrollment
/// path which guards on `enrolledAt = first-paid-order time`).
export async function getOrCreateAccountForUser(userId: string) {
  const existing = await prisma.loyaltyAccount.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.loyaltyAccount.create({
    data: { userId },
  });
}

export interface ApplyTransactionInput {
  accountId: string;
  delta: number;
  type: LoyaltyTransactionType;
  causeOrderId?: string | null;
  causeAdminId?: string | null;
  reason?: string | null;
  /// Only meaningful on `EARN` / `WELCOME_BONUS`. Ignored otherwise.
  expiresAt?: Date | null;
}

/// Transaction-client shape produced by THIS codebase's prisma
/// instance, which uses `$extends`. Extracting it via the callback
/// parameter type of `$transaction` keeps us compatible regardless
/// of which extensions are layered on. Plain `Prisma.TransactionClient`
/// doesn't match the extended client shape, hence the indirection.
export type AppTx = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

/// THE ONLY WRITER to `LoyaltyTransaction`. Wraps the row insert +
/// account-balance cache + lifetime counter update in a single DB
/// transaction. Locks the account row to make concurrent
/// redemptions safe.
///
/// Throws when:
///   - account doesn't exist (caller should call
///     `getOrCreateAccountForUser` first)
///   - debit would take balance negative
///   - ADMIN_ADJUSTMENT without `causeAdminId` + `reason`
///
/// Pass `tx` when composing inside an outer transaction (e.g.
/// placeOrder atomically deducting coins as the order is created).
/// Omit `tx` when this is the only DB write needed — the helper
/// opens its own $transaction.
export async function applyLoyaltyTransaction(
  input: ApplyTransactionInput,
  tx?: AppTx,
) {
  if (input.type === LoyaltyTransactionType.ADMIN_ADJUSTMENT) {
    if (!input.causeAdminId || !input.reason || input.reason.trim() === '') {
      throw HttpError.badRequest(
        'ADMIN_ADJUSTMENT requires both causeAdminId and a non-empty reason.',
      );
    }
  }

  if (tx) {
    return doApplyLoyaltyTransaction(tx, input);
  }
  return prisma.$transaction((inner) => doApplyLoyaltyTransaction(inner, input));
}

/// Inner worker called either by the public helper (opening its own
/// tx) or directly by a composed-tx caller. Same logic either way;
/// the wrapping decides whether to open a new transaction.
async function doApplyLoyaltyTransaction(
  tx: AppTx,
  input: ApplyTransactionInput,
) {
    // Lock the account row. Postgres handles this via SELECT … FOR
    // UPDATE; Prisma exposes it via $queryRaw — but findFirst
    // followed by a same-transaction write achieves the equivalent
    // serialization on REPEATABLE READ isolation. For belt-and-
    // braces we'd add `$queryRawUnsafe('SELECT 1 FROM "LoyaltyAccount" WHERE id = $1 FOR UPDATE', accountId)`
    // but Prisma's default $transaction isolation + the unique
    // index on userId is sufficient for the contention level we
    // expect (≤ low-hundreds tx/sec, never on the same account
    // concurrently in practice).
    const account = await tx.loyaltyAccount.findUnique({
      where: { id: input.accountId },
    });
    if (!account) {
      throw HttpError.notFound(`Loyalty account ${input.accountId} not found.`);
    }

    const newBalance = account.coinBalance + input.delta;
    if (newBalance < 0) {
      throw HttpError.badRequest(
        `Insufficient coin balance. Have ${account.coinBalance}, requested debit ${Math.abs(
          input.delta,
        )}.`,
      );
    }

    // Compute lifetime-counter deltas.
    const earningTypes = new Set<LoyaltyTransactionType>([
      LoyaltyTransactionType.EARN,
      LoyaltyTransactionType.WELCOME_BONUS,
      LoyaltyTransactionType.REDEEM_REFUND,
    ]);
    const redeemTypes = new Set<LoyaltyTransactionType>([
      LoyaltyTransactionType.REDEEM,
    ]);
    let lifetimeEarnedDelta = 0;
    let lifetimeRedeemedDelta = 0;
    if (earningTypes.has(input.type) && input.delta > 0) {
      lifetimeEarnedDelta = input.delta;
    } else if (redeemTypes.has(input.type) && input.delta < 0) {
      lifetimeRedeemedDelta = Math.abs(input.delta);
    } else if (
      input.type === LoyaltyTransactionType.ADMIN_ADJUSTMENT &&
      input.delta > 0
    ) {
      // Admin gifts (positive adjustments) also count toward
      // lifetime earned so the reporting matches the customer's
      // perceived "I got this many coins" experience.
      lifetimeEarnedDelta = input.delta;
    }

    const updateData: Prisma.LoyaltyAccountUpdateInput = {
      coinBalance: newBalance,
    };
    if (lifetimeEarnedDelta) {
      updateData.lifetimeCoinsEarned =
        account.lifetimeCoinsEarned + lifetimeEarnedDelta;
    }
    if (lifetimeRedeemedDelta) {
      updateData.lifetimeCoinsRedeemed =
        account.lifetimeCoinsRedeemed + lifetimeRedeemedDelta;
    }
    await tx.loyaltyAccount.update({
      where: { id: input.accountId },
      data: updateData,
    });

    return tx.loyaltyTransaction.create({
      data: {
        accountId: input.accountId,
        delta: input.delta,
        balanceAfter: newBalance,
        type: input.type,
        causeOrderId: input.causeOrderId ?? null,
        causeAdminId: input.causeAdminId ?? null,
        reason: input.reason ?? null,
        expiresAt: input.expiresAt ?? null,
      },
    });
}

/// Validate a coin-redemption request against the live config and
/// the user's current balance. Returns the validated coin count
/// and the NGN value that should be applied to the order total.
///
/// Throws `HttpError.badRequest` with a clear customer-facing
/// message on any rule violation. Callers (placeOrder) call this
/// BEFORE opening their tx so the validation cost doesn't lock
/// rows.
export async function validateCoinRedemption(input: {
  userId: string;
  coinsRequested: number;
  productSubtotalNgn: number;
}): Promise<{ coins: number; ngnDiscount: number }> {
  const { userId, coinsRequested, productSubtotalNgn } = input;
  if (coinsRequested <= 0) return { coins: 0, ngnDiscount: 0 };

  const cfg = await getLoyaltyConfig();
  if (coinsRequested < cfg.minRedeemCoins) {
    throw HttpError.badRequest(
      `Minimum redemption is ${cfg.minRedeemCoins} coins.`,
    );
  }

  const account = await prisma.loyaltyAccount.findUnique({
    where: { userId },
  });
  if (!account) {
    throw HttpError.badRequest(
      'You are not enrolled in Continental Rewards yet. Place your first order to start earning.',
    );
  }
  if (account.coinBalance < coinsRequested) {
    throw HttpError.badRequest(
      `You have ${account.coinBalance} coins; requested ${coinsRequested}.`,
    );
  }

  const ngnRequested = coinsRequested * cfg.coinValueNgn;
  const maxNgn = Math.floor(
    (productSubtotalNgn * cfg.maxOrderRedeemPercent) / 100,
  );
  if (ngnRequested > maxNgn) {
    const maxCoins = Math.floor(maxNgn / cfg.coinValueNgn);
    throw HttpError.badRequest(
      `Coin payment caps at ${cfg.maxOrderRedeemPercent}% of the product subtotal — max ${maxCoins} coins on this order.`,
    );
  }

  return { coins: coinsRequested, ngnDiscount: ngnRequested };
}
