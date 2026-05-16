import type { Response } from 'express';
import { z } from 'zod';
import { LoyaltyTransactionType } from '@prisma/client';
import type { AuthedRequest } from '@/middleware/auth';
import { HttpError } from '@/middleware/error-handler';
import { prisma } from '@/infra/prisma';
import { logAudit } from '@/modules/audit/service';
import {
  applyLoyaltyTransaction,
  getLoyaltyConfig,
  getOrCreateAccountForUser,
  updateLoyaltyConfig,
  type LoyaltyConfigSnapshot,
} from './service';

const configPatchSchema = z
  .object({
    baseEarnPerOrder: z.number().int().min(0).max(10000),
    tierMultiplier: z.number().min(1).max(20),
    welcomeBonusCoins: z.number().int().min(0).max(100000),
    tier2GoldThreshold: z.number().int().min(0),
    tier3VipThreshold: z.number().int().min(0),
    tier4AmbassadorThreshold: z.number().int().min(0),
    tier5DorimeThreshold: z.number().int().min(0),
    coinValueNgn: z.number().int().min(1).max(100000),
    maxOrderRedeemPercent: z.number().int().min(1).max(100),
    minRedeemCoins: z.number().int().min(1).max(1000000),
    coinExpiryMonths: z.number().int().min(1).max(120),
    spendWindowMonths: z.number().int().min(1).max(120),
    /// 2026-05-16 Phase 2 perks
    birthdayBonusBlue: z.number().int().min(0).max(100000),
    birthdayBonusGold: z.number().int().min(0).max(100000),
    birthdayBonusVip: z.number().int().min(0).max(100000),
    birthdayBonusAmbassador: z.number().int().min(0).max(100000),
    birthdayBonusDorime: z.number().int().min(0).max(100000),
    weekendEarnMultiplier: z.number().min(1).max(10),
    weekendBoostTiers: z.array(
      z.enum(['BLUE', 'GOLD', 'VIP', 'AMBASSADOR', 'DORIME']),
    ),
    maxReferralsPerMonth: z.number().int().min(0).max(1000),
    referralCapBlue: z.number().int().min(0).max(100000),
    referralCapGold: z.number().int().min(0).max(100000),
    referralCapVip: z.number().int().min(0).max(100000),
    referralCapAmbassador: z.number().int().min(0).max(100000),
    referralCapDorime: z.number().int().min(0).max(100000),
    referralPercent: z.number().int().min(0).max(100),
    referralHoldDays: z.number().int().min(0).max(365),
    refereeCouponValidDays: z.number().int().min(1).max(365),
    refereeCouponNgn: z.number().int().min(0).max(1000000),
  })
  .partial()
  .strict();

const accountsListQuery = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  tier: z.enum(['BLUE', 'GOLD', 'VIP', 'AMBASSADOR', 'DORIME']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const accountIdParam = z.object({ id: z.string().min(1) });

const adjustBodySchema = z.object({
  delta: z.number().int().refine((v) => v !== 0, 'delta cannot be zero'),
  reason: z.string().trim().min(3).max(500),
});

/// 2026-05-16 Phase 2 — manual tier downgrade. Only admin path that
/// can drop a tier; the cron + earn flow are upgrade-only.
const downgradeBodySchema = z.object({
  toTier: z.enum(['BLUE', 'GOLD', 'VIP', 'AMBASSADOR', 'DORIME']),
  reason: z.string().trim().min(3).max(500),
});

/// GET /api/admin/loyalty/config
export async function getConfigHandler(
  _req: AuthedRequest,
  res: Response,
): Promise<void> {
  const cfg = await getLoyaltyConfig();
  res.json(cfg);
}

/// PATCH /api/admin/loyalty/config
export async function patchConfigHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const patch = configPatchSchema.parse(req.body);
  // Threshold ordering must be monotonic — Blue < Gold < VIP <
  // Ambassador < Dorime. Validate against the merged values
  // (existing + patch) so a partial PATCH doesn't accidentally
  // create a non-monotonic ladder.
  const current = await getLoyaltyConfig();
  const merged: LoyaltyConfigSnapshot = { ...current, ...patch };
  if (
    merged.tier2GoldThreshold > merged.tier3VipThreshold ||
    merged.tier3VipThreshold > merged.tier4AmbassadorThreshold ||
    merged.tier4AmbassadorThreshold > merged.tier5DorimeThreshold
  ) {
    throw HttpError.badRequest(
      'Tier thresholds must be monotonically increasing: Gold ≤ VIP ≤ Ambassador ≤ Dorime.',
    );
  }
  const updated = await updateLoyaltyConfig(patch, req.user.id);
  await logAudit({
    actorUserId: req.user.id,
    actorEmail: req.user.email,
    entityType: 'LoyaltyConfig',
    entityId: '1',
    action: 'update',
    changes: { before: current, after: updated, patch },
  });
  res.json(updated);
}

/// GET /api/admin/loyalty/accounts
export async function listAccountsHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const { q, tier, page, pageSize } = accountsListQuery.parse(req.query);
  const where = {
    ...(tier ? { currentTier: tier } : {}),
    ...(q
      ? {
          user: {
            OR: [
              { email: { contains: q, mode: 'insensitive' as const } },
              { name: { contains: q, mode: 'insensitive' as const } },
              { phone: { contains: q } },
            ],
          },
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.loyaltyAccount.findMany({
      where,
      include: {
        user: { select: { id: true, email: true, name: true, phone: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.loyaltyAccount.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
}

/// GET /api/admin/loyalty/accounts/:id
export async function getAccountHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const { id } = accountIdParam.parse(req.params);
  const account = await prisma.loyaltyAccount.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, name: true, phone: true } },
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 100,
      },
    },
  });
  if (!account) throw HttpError.notFound('Loyalty account not found.');
  res.json(account);
}

/// POST /api/admin/loyalty/accounts/:id/adjust
/// Manual coin adjustment. Positive = credit (gift / goodwill).
/// Negative = debit (fraud clawback / correction).
export async function adjustAccountHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const { id } = accountIdParam.parse(req.params);
  const { delta, reason } = adjustBodySchema.parse(req.body);

  const account = await prisma.loyaltyAccount.findUnique({ where: { id } });
  if (!account) throw HttpError.notFound('Loyalty account not found.');

  const tx = await applyLoyaltyTransaction({
    accountId: id,
    delta,
    type: LoyaltyTransactionType.ADMIN_ADJUSTMENT,
    causeAdminId: req.user.id,
    reason,
  });

  await logAudit({
    actorUserId: req.user.id,
    actorEmail: req.user.email,
    entityType: 'LoyaltyAccount',
    entityId: id,
    action: 'adjust',
    changes: { delta, reason, transactionId: tx.id },
  });

  res.status(201).json(tx);
}

/// POST /api/admin/loyalty/accounts/:id/downgrade
/// 2026-05-16 Phase 2 — manual tier downgrade with mandatory
/// reason. The only path that can drop a tier; the cron + earn
/// flow upgrade-only since Magnus' rule that tiers stick once
/// earned. Writes an ADMIN_ADJUSTMENT ledger row + AuditLog entry
/// so the audit trail is complete.
export async function downgradeAccountHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const { id } = accountIdParam.parse(req.params);
  const { toTier, reason } = downgradeBodySchema.parse(req.body);

  const account = await prisma.loyaltyAccount.findUnique({ where: { id } });
  if (!account) throw HttpError.notFound('Loyalty account not found.');

  const fromTier = account.currentTier;
  /// Refuse no-op or upward moves — admins use a separate "adjust"
  /// path for upgrades (or just let the customer earn it naturally).
  const rank = (t: string) =>
    ['BLUE', 'GOLD', 'VIP', 'AMBASSADOR', 'DORIME'].indexOf(t);
  if (rank(toTier) >= rank(fromTier)) {
    throw HttpError.badRequest(
      `Downgrade target ${toTier} is not below current tier ${fromTier}.`,
    );
  }

  const updated = await prisma.loyaltyAccount.update({
    where: { id },
    data: {
      currentTier: toTier,
      lastDowngradedAt: new Date(),
      /// Keep tierProtected=true so the cron still won't auto-
      /// downgrade further from here. If admin wants to fully
      /// reset back to "earned-from-zero", they downgrade to BLUE
      /// — which is the natural floor anyway.
    },
  });

  /// Write a zero-delta ADMIN_ADJUSTMENT ledger row so the
  /// downgrade event is captured in the customer's activity log
  /// next to coin adjustments. The customer's coin balance doesn't
  /// change — only the tier moves.
  await prisma.loyaltyTransaction.create({
    data: {
      accountId: id,
      delta: 0,
      balanceAfter: account.coinBalance,
      type: LoyaltyTransactionType.ADMIN_ADJUSTMENT,
      causeAdminId: req.user.id,
      reason: `Tier downgraded ${fromTier} → ${toTier}: ${reason}`,
    },
  });

  await logAudit({
    actorUserId: req.user.id,
    actorEmail: req.user.email,
    entityType: 'LoyaltyAccount',
    entityId: id,
    action: 'tier_downgraded',
    changes: { from: fromTier, to: toTier, reason },
  });

  res.json(updated);
}

/// GET /api/admin/loyalty/accounts/by-user/:userId
/// Used when admin opens a customer page and wants to see/edit
/// their loyalty state in one click. Auto-creates the account if
/// the user has never paid (so admin can pre-credit a customer
/// before their first order — possible but unusual).
export async function getOrCreateAccountByUserHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const userId = z.string().min(1).parse(req.params.userId);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw HttpError.notFound('User not found.');
  const account = await getOrCreateAccountForUser(userId);
  res.json(account);
}
