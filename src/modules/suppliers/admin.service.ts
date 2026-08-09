import { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { notifyPIQApproved, notifyPIQChanges } from './notify';

/**
 * Admin-side supplier review. Gated by `suppliers.review` in the admin
 * router. Lets staff work the PIQ review queue: approve a product, or send
 * it back with per-field feedback (which the supplier sees in their editor).
 */

export interface AdminQueuePIQ {
  id: string;
  name: string;
  status: string;
  completion: number;
  company: string;
  email: string;
  country: string;
  updatedAt: string;
}

const REVIEWABLE: Prisma.EnumPIQStatusFilter = { in: ['UNDER_REVIEW', 'SUBMITTED'] };

export async function listReviewQueue(): Promise<AdminQueuePIQ[]> {
  const piqs = await prisma.productPIQ.findMany({
    where: { status: REVIEWABLE },
    include: { supplier: { select: { companyName: true, country: true, user: { select: { email: true } } } } },
    orderBy: { updatedAt: 'asc' },
  });
  return piqs.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    completion: p.completion,
    company: p.supplier.companyName,
    email: p.supplier.user.email,
    country: p.supplier.country,
    updatedAt: p.updatedAt.toISOString(),
  }));
}

export async function listSuppliersForAdmin() {
  const suppliers = await prisma.supplierProfile.findMany({
    include: {
      user: { select: { email: true } },
      _count: { select: { piqs: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return suppliers.map((s) => ({
    id: s.id,
    company: s.companyName,
    contact: s.contactName,
    email: s.user.email,
    country: s.country,
    category: s.category,
    currentStage: s.currentStage,
    status: s.status,
    products: s._count.piqs,
    source: s.source,
    createdAt: s.createdAt.toISOString(),
  }));
}

/** PATCH /admin/suppliers/:id — advance stage / change status. */
export async function updateSupplierAdmin(
  id: string,
  input: { currentStage?: number; status?: 'ACTIVE' | 'SUSPENDED' },
) {
  const existing = await prisma.supplierProfile.findUnique({ where: { id } });
  if (!existing) throw HttpError.notFound('Supplier not found');
  const updated = await prisma.supplierProfile.update({
    where: { id },
    data: {
      ...(input.currentStage !== undefined && { currentStage: input.currentStage }),
      ...(input.status !== undefined && { status: input.status }),
    },
  });
  return { id: updated.id, currentStage: updated.currentStage, status: updated.status };
}

export async function getPIQForAdmin(id: string) {
  const p = await prisma.productPIQ.findUnique({
    where: { id },
    include: { supplier: { include: { user: { select: { email: true } } } } },
  });
  if (!p) throw HttpError.notFound('PIQ not found');
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.category,
    status: p.status,
    completion: p.completion,
    answers: (p.answers as Record<string, unknown>) ?? {},
    reviewSummary: p.reviewSummary ?? null,
    feedback: (p.feedback as Record<string, string>) ?? null,
    company: p.supplier.companyName,
    contact: p.supplier.contactName,
    email: p.supplier.user.email,
    supplierId: p.supplierId,
    supplierUserId: p.supplier.userId,
    updatedAt: p.updatedAt.toISOString(),
  };
}

export async function approvePIQ(id: string) {
  const detail = await getPIQForAdmin(id); // 404 if missing
  const p = await prisma.productPIQ.update({
    where: { id },
    data: { status: 'APPROVED', reviewSummary: null, feedback: Prisma.DbNull },
  });
  await notifyPIQApproved({
    to: detail.email,
    userId: detail.supplierUserId,
    recipientName: detail.contact,
    productName: detail.name,
  });
  return { id: p.id, status: p.status };
}

export async function requestPIQChanges(
  id: string,
  input: { summary: string; feedback: Record<string, string> },
) {
  const detail = await getPIQForAdmin(id);
  const p = await prisma.productPIQ.update({
    where: { id },
    data: {
      status: 'REVISION_REQUIRED',
      reviewSummary: input.summary,
      feedback: input.feedback as Prisma.InputJsonValue,
    },
  });
  await notifyPIQChanges({
    to: detail.email,
    userId: detail.supplierUserId,
    recipientName: detail.contact,
    productName: detail.name,
    summary: input.summary,
    piqId: id,
  });
  return { id: p.id, status: p.status };
}
