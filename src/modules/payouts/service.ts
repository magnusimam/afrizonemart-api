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

/// A payout covers BOTH image submissions and full-product
/// submissions for one intern (2026-05-24, PR 1b). Both tables share
/// the same eligibility shape: APPROVED, not yet attached to a payout,
/// reviewedAt inside the window. The `reviewedAt` filter is the date
/// the money became payable.
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

function eligibleProductSubmissionWhere(
  win: PayoutWindow,
): Prisma.ProductSubmissionWhereInput {
  const where: Prisma.ProductSubmissionWhereInput = {
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
/// Returns the eligible image + product submission rows plus the
/// combined total. Safe to call repeatedly while the admin tunes the
/// window.
export async function previewPayout(win: PayoutWindow) {
  const [submissions, productSubmissions] = await Promise.all([
    prisma.productImageSubmission.findMany({
      where: eligibleSubmissionWhere(win),
      orderBy: { reviewedAt: 'asc' },
      select: {
        id: true,
        reviewedAt: true,
        payRate: true,
        product: { select: { id: true, slug: true, name: true } },
      },
    }),
    prisma.productSubmission.findMany({
      where: eligibleProductSubmissionWhere(win),
      orderBy: { reviewedAt: 'asc' },
      select: {
        id: true,
        reviewedAt: true,
        payRate: true,
        name: true,
        slug: true,
        createdProductId: true,
      },
    }),
  ]);
  const totalNgn =
    submissions.reduce((acc, s) => acc + s.payRate, 0) +
    productSubmissions.reduce((acc, s) => acc + s.payRate, 0);
  return {
    submissions,
    productSubmissions,
    totalNgn,
    submissionCount: submissions.length + productSubmissions.length,
  };
}

/// Stamp the eligible submissions with a new payoutId in a tx.
/// Refuses to create an empty payout — that wouldn't help anyone
/// and would clutter the admin list with zero-row drafts.
export async function createPayoutDraft(
  win: PayoutWindow,
  actorId: string | null,
) {
  return prisma.$transaction(async (tx) => {
    const [imageCandidates, productCandidates] = await Promise.all([
      tx.productImageSubmission.findMany({
        where: eligibleSubmissionWhere(win),
        select: { id: true, payRate: true },
      }),
      tx.productSubmission.findMany({
        where: eligibleProductSubmissionWhere(win),
        select: { id: true, payRate: true },
      }),
    ]);
    const candidateCount = imageCandidates.length + productCandidates.length;
    if (candidateCount === 0) {
      throw HttpError.badRequest(
        'No approved, unpaid submissions match that window.',
      );
    }
    const totalNgn =
      imageCandidates.reduce((acc, s) => acc + s.payRate, 0) +
      productCandidates.reduce((acc, s) => acc + s.payRate, 0);

    const payout = await tx.internPayout.create({
      data: {
        internId: win.internId,
        totalNgn,
        submissionCount: candidateCount,
        windowFrom: win.fromDate ?? null,
        windowTo: win.toDate ?? null,
        createdById: actorId,
      },
    });

    /// Stamp every candidate of BOTH types. Re-check `payoutId IS
    /// NULL` in each WHERE so a concurrent draft on the same intern
    /// can't double-claim a row — only the first writer wins.
    const [imageUpdated, productUpdated] = await Promise.all([
      imageCandidates.length > 0
        ? tx.productImageSubmission.updateMany({
            where: { id: { in: imageCandidates.map((c) => c.id) }, payoutId: null },
            data: { payoutId: payout.id },
          })
        : Promise.resolve({ count: 0 }),
      productCandidates.length > 0
        ? tx.productSubmission.updateMany({
            where: { id: { in: productCandidates.map((c) => c.id) }, payoutId: null },
            data: { payoutId: payout.id },
          })
        : Promise.resolve({ count: 0 }),
    ]);

    if (imageUpdated.count + productUpdated.count !== candidateCount) {
      /// A concurrent draft beat us to some rows. Recompute the
      /// snapshot from what we actually claimed so totalNgn /
      /// submissionCount stay truthful.
      const [refImages, refProducts] = await Promise.all([
        tx.productImageSubmission.findMany({
          where: { payoutId: payout.id },
          select: { payRate: true },
        }),
        tx.productSubmission.findMany({
          where: { payoutId: payout.id },
          select: { payRate: true },
        }),
      ]);
      const claimed = refImages.length + refProducts.length;
      const newTotal =
        refImages.reduce((acc, s) => acc + s.payRate, 0) +
        refProducts.reduce((acc, s) => acc + s.payRate, 0);
      if (claimed === 0) {
        await tx.internPayout.delete({ where: { id: payout.id } });
        throw HttpError.conflict(
          'Another admin just claimed those submissions. Refresh and try again.',
        );
      }
      await tx.internPayout.update({
        where: { id: payout.id },
        data: { totalNgn: newTotal, submissionCount: claimed },
      });
    }

    return tx.internPayout.findUniqueOrThrow({
      where: { id: payout.id },
      include: {
        intern: { select: { id: true, name: true, email: true } },
        _count: { select: { submissions: true, productSubmissions: true } },
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
      _count: { select: { submissions: true, productSubmissions: true } },
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
    /// Return BOTH submission types to the unpaid pool before deleting
    /// the draft.
    await Promise.all([
      tx.productImageSubmission.updateMany({
        where: { payoutId: payout.id },
        data: { payoutId: null },
      }),
      tx.productSubmission.updateMany({
        where: { payoutId: payout.id },
        data: { payoutId: null },
      }),
    ]);
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
      productSubmissions: {
        orderBy: { reviewedAt: 'asc' },
        select: {
          id: true,
          reviewedAt: true,
          payRate: true,
          name: true,
          slug: true,
          createdProductId: true,
        },
      },
    },
  });
  if (!payout) throw HttpError.notFound('Payout not found');
  return payout;
}
