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
