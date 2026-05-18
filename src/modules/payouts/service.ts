import type { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import type { ListPayoutsQuery, PayoutWindow } from './schema';

/// Tracker #50 — intern image-work payouts (2026-05-18).
///
/// One InternPayout row per payday for one intern. Submissions roll
/// into a payout via ProductImageSubmission.payoutId — null until
/// rolled in. Stamping is done in a transaction with FOR UPDATE on
/// the candidate rows so two admins can't double-bill the same work.

function eligibleSubmissionWhere(
  win: PayoutWindow,
): Prisma.ProductImageSubmissionWhereInput {
  const where: Prisma.ProductImageSubmissionWhereInput = {
    internId: win.internId,
    status: 'APPROVED',
    payoutId: null,
    reviewedAt: { not: null },
  };
  if (win.fromDate || win.toDate) {
    where.reviewedAt = {
      not: null,
      ...(win.fromDate ? { gte: win.fromDate } : {}),
      ...(win.toDate ? { lte: win.toDate } : {}),
    };
  }
  return where;
}

/// Read-only preview of what `createPayoutDraft` would attach.
/// Returns the eligible submission rows plus the total they would
/// sum to. Safe to call repeatedly while the admin tunes the window.
export async function previewPayout(win: PayoutWindow) {
  const submissions = await prisma.productImageSubmission.findMany({
    where: eligibleSubmissionWhere(win),
    orderBy: { reviewedAt: 'asc' },
    select: {
      id: true,
      reviewedAt: true,
      payRate: true,
      product: { select: { id: true, slug: true, name: true } },
    },
  });
  const totalNgn = submissions.reduce((acc, s) => acc + s.payRate, 0);
  return { submissions, totalNgn, submissionCount: submissions.length };
}

/// Stamp the eligible submissions with a new payoutId in a tx.
/// Refuses to create an empty payout — that wouldn't help anyone
/// and would clutter the admin list with zero-row drafts.
export async function createPayoutDraft(
  win: PayoutWindow,
  actorId: string | null,
) {
  return prisma.$transaction(async (tx) => {
    const candidates = await tx.productImageSubmission.findMany({
      where: eligibleSubmissionWhere(win),
      select: { id: true, payRate: true, reviewedAt: true },
    });
    if (candidates.length === 0) {
      throw HttpError.badRequest(
        'No approved, unpaid submissions match that window.',
      );
    }
    const totalNgn = candidates.reduce((acc, s) => acc + s.payRate, 0);

    const payout = await tx.internPayout.create({
      data: {
        internId: win.internId,
        totalNgn,
        submissionCount: candidates.length,
        windowFrom: win.fromDate ?? null,
        windowTo: win.toDate ?? null,
        createdById: actorId,
      },
    });

    /// Stamp every candidate. Re-check `payoutId IS NULL` in the
    /// WHERE so a concurrent draft on the same intern can't
    /// double-claim a row — only the first writer wins.
    const updated = await tx.productImageSubmission.updateMany({
      where: {
        id: { in: candidates.map((c) => c.id) },
        payoutId: null,
      },
      data: { payoutId: payout.id },
    });

    if (updated.count !== candidates.length) {
      /// A concurrent draft beat us to some rows. Recompute the
      /// snapshot so totalNgn / submissionCount stay truthful.
      const refreshed = await tx.productImageSubmission.findMany({
        where: { payoutId: payout.id },
        select: { payRate: true },
      });
      const newTotal = refreshed.reduce((acc, s) => acc + s.payRate, 0);
      await tx.internPayout.update({
        where: { id: payout.id },
        data: { totalNgn: newTotal, submissionCount: refreshed.length },
      });
      if (refreshed.length === 0) {
        await tx.internPayout.delete({ where: { id: payout.id } });
        throw HttpError.conflict(
          'Another admin just claimed those submissions. Refresh and try again.',
        );
      }
    }

    return tx.internPayout.findUniqueOrThrow({
      where: { id: payout.id },
      include: {
        intern: { select: { id: true, name: true, email: true } },
        _count: { select: { submissions: true } },
      },
    });
  });
}

/// Flip a draft payout to PAID. Records the bank/MM reference and
/// note so finance can reconcile later.
export async function finalizePayout(
  payoutId: string,
  body: { externalRef?: string; note?: string },
) {
  const payout = await prisma.internPayout.findUnique({
    where: { id: payoutId },
    select: { id: true, paidAt: true },
  });
  if (!payout) throw HttpError.notFound('Payout not found');
  if (payout.paidAt) {
    throw HttpError.conflict('Payout has already been marked paid.');
  }
  return prisma.internPayout.update({
    where: { id: payoutId },
    data: {
      paidAt: new Date(),
      externalRef: body.externalRef ?? null,
      note: body.note ?? null,
    },
    include: {
      intern: { select: { id: true, name: true, email: true } },
      _count: { select: { submissions: true } },
    },
  });
}

/// Cancel a draft — only allowed while paidAt is null. Returns the
/// stamped submissions back to the "unpaid" pool.
export async function cancelPayoutDraft(payoutId: string) {
  return prisma.$transaction(async (tx) => {
    const payout = await tx.internPayout.findUnique({
      where: { id: payoutId },
      select: { id: true, paidAt: true },
    });
    if (!payout) throw HttpError.notFound('Payout not found');
    if (payout.paidAt) {
      throw HttpError.conflict(
        'Cannot cancel a payout that has already been marked paid.',
      );
    }
    await tx.productImageSubmission.updateMany({
      where: { payoutId: payout.id },
      data: { payoutId: null },
    });
    await tx.internPayout.delete({ where: { id: payout.id } });
    return { ok: true };
  });
}

export async function listPayouts(query: ListPayoutsQuery) {
  const where: Prisma.InternPayoutWhereInput = {};
  if (query.internId) where.internId = query.internId;
  if (query.status === 'draft') where.paidAt = null;
  else if (query.status === 'paid') where.paidAt = { not: null };

  const items = await prisma.internPayout.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: query.limit,
    include: {
      intern: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
  return { items };
}

export async function getPayout(payoutId: string) {
  const payout = await prisma.internPayout.findUnique({
    where: { id: payoutId },
    include: {
      intern: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true, email: true } },
      submissions: {
        orderBy: { reviewedAt: 'asc' },
        select: {
          id: true,
          reviewedAt: true,
          payRate: true,
          product: { select: { id: true, slug: true, name: true } },
        },
      },
    },
  });
  if (!payout) throw HttpError.notFound('Payout not found');
  return payout;
}
