import { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { toPublicPO } from './trade.service';
import { notifyListingPublished, notifyPOIssued, notifyTradeEngagement } from './notify';

/**
 * Activation & Procurement admin (gated `suppliers.trade`). Two surfaces:
 *  - Listings: review the Stage-8 photos a supplier submitted, then publish
 *    (advances them to Stage 9).
 *  - Purchase Orders: issue POs to activated suppliers; track ack/fulfilment.
 */

// ── Stage 8 listings ────────────────────────────────────────────────
interface Stage8 { photos?: Record<string, string>; submittedAt?: string; publishedAt?: string }

export async function listListings() {
  const suppliers = await prisma.supplierProfile.findMany({
    where: { currentStage: { gte: 8 } },
    include: { user: { select: { email: true } } },
    orderBy: { updatedAt: 'asc' },
  });
  return suppliers
    .map((s) => {
      const st8 = (s.stageAnswers as Record<string, Stage8> | null)?.['8'];
      if (!st8?.submittedAt) return null;
      return {
        supplierId: s.id,
        company: s.companyName,
        email: s.user.email,
        country: s.country,
        category: s.category,
        photos: st8.photos ?? {},
        submittedAt: st8.submittedAt,
        publishedAt: st8.publishedAt ?? null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

export async function publishListing(supplierId: string) {
  const supplier = await prisma.supplierProfile.findUnique({
    where: { id: supplierId },
    include: { user: { select: { email: true, name: true } } },
  });
  if (!supplier) throw HttpError.notFound('Supplier not found');
  const all = (supplier.stageAnswers as Record<string, Stage8> | null) ?? {};
  const st8 = all['8'];
  if (!st8?.submittedAt) throw HttpError.badRequest('This supplier has not submitted listing photos.');

  all['8'] = { ...st8, publishedAt: new Date().toISOString() };
  await prisma.supplierProfile.update({
    where: { id: supplierId },
    data: {
      stageAnswers: all as Prisma.InputJsonValue,
      currentStage: Math.max(supplier.currentStage, 9),
    },
  });

  await notifyListingPublished({
    to: supplier.user.email,
    userId: supplier.userId,
    recipientName: supplier.user.name ?? supplier.contactName,
  });

  // Publishing is also the moment they reach Stage 9 (Trade Engagement), so the
  // congratulations email belongs here rather than on a separate trigger.
  // `notifyTradeEngagement` is once-ever guarded, so re-publishing a listing
  // won't congratulate the same supplier twice.
  await notifyTradeEngagement({
    to: supplier.user.email,
    userId: supplier.userId,
    recipientName: supplier.user.name ?? supplier.contactName,
    companyName: supplier.companyName,
  });

  return { supplierId, publishedAt: all['8'].publishedAt };
}

// ── Purchase orders ─────────────────────────────────────────────────
interface POItem { product?: string; qty?: number; unit?: string; unitPrice?: number }

function computeTotal(items: POItem[]): number {
  return items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
}

function genPoNumber(): string {
  const y = new Date().getFullYear();
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `PO-${y}-${rand}`;
}

export async function listAdminPurchaseOrders() {
  const pos = await prisma.purchaseOrder.findMany({
    include: { supplier: { select: { companyName: true, user: { select: { email: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  return pos.map((po) => ({
    ...toPublicPO(po),
    company: po.supplier.companyName,
    email: po.supplier.user.email,
    supplierId: po.supplierId,
  }));
}

export async function issuePurchaseOrder(
  supplierId: string,
  input: { items: POItem[]; currency?: string; dueDate?: string; notes?: string },
) {
  const supplier = await prisma.supplierProfile.findUnique({
    where: { id: supplierId },
    include: { user: { select: { email: true, name: true } } },
  });
  if (!supplier) throw HttpError.notFound('Supplier not found');
  if (!input.items.length) throw HttpError.badRequest('A purchase order needs at least one line item.');

  const totalAmount = computeTotal(input.items);
  const currency = input.currency || 'NGN';
  const poNumber = genPoNumber();

  const po = await prisma.purchaseOrder.create({
    data: {
      supplierId,
      poNumber,
      status: 'ISSUED',
      items: input.items as unknown as Prisma.InputJsonValue,
      currency,
      totalAmount,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      notes: input.notes ?? null,
    },
  });

  await notifyPOIssued({
    to: supplier.user.email,
    userId: supplier.userId,
    recipientName: supplier.user.name ?? supplier.contactName,
    poNumber,
    currency,
    totalAmount,
  });

  return toPublicPO(po);
}

export async function cancelPurchaseOrder(id: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po) throw HttpError.notFound('Purchase order not found');

  // A fulfilled order is history, not a workflow state. Cancelling one would
  // say the supplier never delivered goods they have already shipped — and it
  // silently drops out of `valueFulfilled` on their Stage-10 performance card.
  // Raise a credit note or a return against it instead.
  if (po.status === 'FULFILLED') {
    throw HttpError.badRequest(
      'This order has already been fulfilled and cannot be cancelled. Raise a return or credit note instead.',
    );
  }
  if (po.status === 'CANCELLED') {
    throw HttpError.badRequest('This order is already cancelled.');
  }

  const updated = await prisma.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
  return toPublicPO(updated);
}
