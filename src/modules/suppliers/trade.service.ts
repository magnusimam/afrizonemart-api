import { type PurchaseOrder } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';

/**
 * Stage 9 (Procurement & Trade) + Stage 10 (Continuous Engagement), supplier
 * side. Purchase orders AZM issues; the supplier acknowledges and fulfils.
 */

async function profileOrThrow(userId: string) {
  const p = await prisma.supplierProfile.findUnique({ where: { userId } });
  if (!p) throw HttpError.notFound('No supplier profile for this account');
  return p;
}

export interface PublicPO {
  id: string;
  poNumber: string;
  status: string;
  items: unknown[];
  currency: string;
  totalAmount: number;
  dueDate: string | null;
  notes: string | null;
  acknowledgedAt: string | null;
  fulfilledAt: string | null;
  createdAt: string;
}

export function toPublicPO(po: PurchaseOrder): PublicPO {
  return {
    id: po.id,
    poNumber: po.poNumber,
    status: po.status,
    items: (po.items as unknown[]) ?? [],
    currency: po.currency,
    totalAmount: po.totalAmount,
    dueDate: po.dueDate ? po.dueDate.toISOString() : null,
    notes: po.notes ?? null,
    acknowledgedAt: po.acknowledgedAt ? po.acknowledgedAt.toISOString() : null,
    fulfilledAt: po.fulfilledAt ? po.fulfilledAt.toISOString() : null,
    createdAt: po.createdAt.toISOString(),
  };
}

export async function listPurchaseOrders(userId: string): Promise<PublicPO[]> {
  const profile = await profileOrThrow(userId);
  const pos = await prisma.purchaseOrder.findMany({
    where: { supplierId: profile.id },
    orderBy: { createdAt: 'desc' },
  });
  return pos.map(toPublicPO);
}

async function ownedPO(userId: string, id: string) {
  const profile = await profileOrThrow(userId);
  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po || po.supplierId !== profile.id) throw HttpError.notFound('Purchase order not found');
  return po;
}

export async function acknowledgePO(userId: string, id: string): Promise<PublicPO> {
  const po = await ownedPO(userId, id);
  if (po.status !== 'ISSUED') throw HttpError.badRequest('This order can no longer be acknowledged.');
  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
  });
  return toPublicPO(updated);
}

export async function fulfillPO(userId: string, id: string): Promise<PublicPO> {
  const po = await ownedPO(userId, id);
  if (po.status !== 'ACKNOWLEDGED') throw HttpError.badRequest('Acknowledge the order before marking it fulfilled.');
  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: 'FULFILLED', fulfilledAt: new Date() },
  });
  return toPublicPO(updated);
}

export interface SupplierPerformance {
  currentStage: number;
  status: string;
  memberSince: string;
  products: number;
  listingLive: boolean;
  audit: { outcome: string | null; score: number | null } | null;
  orders: { total: number; acknowledged: number; fulfilled: number; valueFulfilled: number };
}

/** GET /me/performance — Stage 10 continuous-engagement snapshot. */
export async function getPerformance(userId: string): Promise<SupplierPerformance> {
  const profile = await prisma.supplierProfile.findUnique({
    where: { userId },
    include: {
      audit: { select: { outcome: true, indicativeScore: true, status: true } },
      purchaseOrders: { select: { status: true, totalAmount: true } },
      _count: { select: { piqs: true } },
    },
  });
  if (!profile) throw HttpError.notFound('No supplier profile for this account');

  const stage8 = (profile.stageAnswers as Record<string, { publishedAt?: string }> | null)?.['8'];
  const pos = profile.purchaseOrders;
  const fulfilled = pos.filter((p) => p.status === 'FULFILLED');

  return {
    currentStage: profile.currentStage,
    status: profile.status,
    memberSince: profile.createdAt.toISOString(),
    products: profile._count.piqs,
    listingLive: !!stage8?.publishedAt,
    audit: profile.audit && profile.audit.status === 'COMPLETED'
      ? { outcome: profile.audit.outcome ?? null, score: profile.audit.indicativeScore ?? null }
      : null,
    orders: {
      total: pos.length,
      acknowledged: pos.filter((p) => p.status === 'ACKNOWLEDGED').length,
      fulfilled: fulfilled.length,
      valueFulfilled: fulfilled.reduce((sum, p) => sum + p.totalAmount, 0),
    },
  };
}
