import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { toPublicReviewCall } from './reviewcall.service';
import { notifyReviewCallScheduled } from './notify';

/**
 * Admin — Supplier Relations Desk / Merchandise Sourcing. Triage the live
 * orientation comments (many are real questions) and schedule/confirm the PIQ
 * review calls. Gated by `suppliers.review`.
 */

// ── Live orientation comments ───────────────────────────────────────
export async function listOrientationComments(onlyQuestions?: boolean) {
  const rows = await prisma.orientationComment.findMany({
    where: onlyQuestions ? { isQuestion: true } : {},
    include: {
      supplier: { select: { companyName: true, contactName: true, user: { select: { email: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((c) => ({
    id: c.id,
    body: c.body,
    atSeconds: c.atSeconds ?? null,
    isQuestion: c.isQuestion,
    answeredAt: c.answeredAt ? c.answeredAt.toISOString() : null,
    adminNote: c.adminNote ?? null,
    createdAt: c.createdAt.toISOString(),
    company: c.supplier.companyName,
    contact: c.supplier.contactName,
    email: c.supplier.user.email,
  }));
}

export async function updateOrientationComment(
  id: string,
  input: { isQuestion?: boolean; answered?: boolean; adminNote?: string },
) {
  const existing = await prisma.orientationComment.findUnique({ where: { id } });
  if (!existing) throw HttpError.notFound('Comment not found');
  const updated = await prisma.orientationComment.update({
    where: { id },
    data: {
      ...(input.isQuestion !== undefined && { isQuestion: input.isQuestion }),
      ...(input.adminNote !== undefined && { adminNote: input.adminNote }),
      ...(input.answered !== undefined && { answeredAt: input.answered ? new Date() : null }),
    },
  });
  return { id: updated.id, isQuestion: updated.isQuestion, answeredAt: updated.answeredAt ? updated.answeredAt.toISOString() : null };
}

// ── PIQ review calls ────────────────────────────────────────────────
export async function listReviewCalls() {
  const suppliers = await prisma.supplierProfile.findMany({
    where: { OR: [{ currentStage: { gte: 5 } }, { reviewCall: { isNot: null } }] },
    include: { user: { select: { email: true } }, reviewCall: true },
    orderBy: { updatedAt: 'asc' },
  });
  return suppliers.map((s) => ({
    supplierId: s.id,
    company: s.companyName,
    contact: s.contactName,
    email: s.user.email,
    country: s.country,
    currentStage: s.currentStage,
    call: s.reviewCall ? toPublicReviewCall(s.reviewCall) : null,
  }));
}

export async function scheduleReviewCall(
  supplierId: string,
  input: { scheduledAt: string; meetingMode?: string; meetingLink?: string; notes?: string },
) {
  const supplier = await prisma.supplierProfile.findUnique({
    where: { id: supplierId },
    include: { user: { select: { email: true, name: true } } },
  });
  if (!supplier) throw HttpError.notFound('Supplier not found');

  const when = new Date(input.scheduledAt);
  if (Number.isNaN(when.getTime())) throw HttpError.badRequest('Invalid date.');

  const rc = await prisma.reviewCall.upsert({
    where: { supplierId },
    update: {
      status: 'SCHEDULED',
      scheduledAt: when,
      meetingMode: input.meetingMode ?? null,
      meetingLink: input.meetingLink ?? null,
      notes: input.notes ?? null,
      proposedAt: null,
    },
    create: {
      supplierId,
      status: 'SCHEDULED',
      scheduledAt: when,
      meetingMode: input.meetingMode ?? null,
      meetingLink: input.meetingLink ?? null,
      notes: input.notes ?? null,
    },
  });

  await notifyReviewCallScheduled({
    to: supplier.user.email,
    userId: supplier.userId,
    recipientName: supplier.user.name ?? supplier.contactName,
    scheduledAt: when,
    meetingMode: rc.meetingMode,
    meetingLink: rc.meetingLink,
    supplierId,
  });

  return toPublicReviewCall(rc);
}
