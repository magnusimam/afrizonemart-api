import type { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import type {
  BulkAssignBody,
  ClaimQueueBody,
  ReassignBody,
  ReviewSubmissionBody,
  SubmitImagesBody,
} from './schema';

// =============================================================
// INTERN-FACING HELPERS
// =============================================================

/**
 * Returns the products in the intern's bucket plus their submission
 * status. Status flavours:
 *   - "todo"     → no submission yet
 *   - "pending"  → submission in PENDING_REVIEW
 *   - "approved" → most recent submission APPROVED
 *   - "rejected" → most recent submission REJECTED (needs rework)
 */
export async function getInternQueue(internId: string) {
  const products = await prisma.product.findMany({
    where: { assignedInternId: internId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      slug: true,
      name: true,
      brand: true,
      category: { select: { slug: true, name: true } },
      images: true,
      imageSubmissions: {
        where: { internId },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          status: true,
          rejectionReason: true,
          frontImageUrl: true,
          backImageUrl: true,
          sideImageUrl: true,
          additionalImages: true,
          reviewedAt: true,
          createdAt: true,
        },
      },
    },
  });

  let stats = { todo: 0, pending: 0, approved: 0, rejected: 0 };
  const items = products.map((p) => {
    const latest = p.imageSubmissions[0] ?? null;
    let status: 'todo' | 'pending' | 'approved' | 'rejected' = 'todo';
    if (latest) {
      status =
        latest.status === 'APPROVED'
          ? 'approved'
          : latest.status === 'REJECTED'
            ? 'rejected'
            : 'pending';
    }
    stats[status]++;
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      category: p.category,
      currentImages: p.images,
      latestSubmission: latest,
      status,
    };
  });

  return { items, stats };
}

/**
 * Pull N products from the unassigned pool into this intern's bucket.
 * "Unassigned pool" = products without an assignedInternId AND with
 * fewer than the minimum-image threshold. Atomic: a competing intern
 * claiming at the same time gets a different set because we filter on
 * assignedInternId === null in the update.
 */
export async function claimFromUnassignedPool(internId: string, body: ClaimQueueBody) {
  const candidates = await prisma.product.findMany({
    where: {
      assignedInternId: null,
      // Unimaged-or-undersized: < 3 images means the product needs
      // the front/back/side workflow.
    },
    take: body.count,
    select: { id: true, images: true },
  });
  // Filter client-side rather than Postgres because Prisma doesn't
  // expose array-length filtering cleanly. The `take` window is small.
  const targetIds = candidates.filter((p) => p.images.length < 3).map((p) => p.id);
  if (targetIds.length === 0) return { claimed: 0 };

  // updateMany with both `assignedInternId: null` AND `id IN (...)`
  // gives us atomicity — if two interns picked the same id, only one
  // update wins.
  const r = await prisma.product.updateMany({
    where: { id: { in: targetIds }, assignedInternId: null },
    data: { assignedInternId: internId },
  });
  return { claimed: r.count };
}

/**
 * Intern submits front/back/side images for a product they own. If a
 * REJECTED submission exists, this creates a fresh PENDING_REVIEW row
 * (history stays). Refuses if the product isn't in their bucket.
 */
export async function submitImages(
  internId: string,
  productId: string,
  body: SubmitImagesBody,
) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, assignedInternId: true },
  });
  if (!product) throw HttpError.notFound('Product not found');
  if (product.assignedInternId !== internId) {
    throw HttpError.forbidden('This product is not assigned to you.');
  }

  // Block double-pending: only one PENDING_REVIEW submission per
  // (product, intern) at a time.
  const existingPending = await prisma.productImageSubmission.findFirst({
    where: { productId, internId, status: 'PENDING_REVIEW' },
    select: { id: true },
  });
  if (existingPending) {
    throw HttpError.conflict(
      'You already have a submission for this product awaiting review.',
    );
  }

  return prisma.productImageSubmission.create({
    data: {
      productId,
      internId,
      frontImageUrl: body.frontImageUrl,
      backImageUrl: body.backImageUrl,
      sideImageUrl: body.sideImageUrl,
      additionalImages: body.additionalImages,
      status: 'PENDING_REVIEW',
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
    },
  });
}

// =============================================================
// ADMIN-FACING HELPERS
// =============================================================

/**
 * Distribute products from the chosen scope across one or more
 * interns, round-robin. Idempotent in the sense that products already
 * assigned are left untouched (we only ever write where current
 * assignment is null).
 */
export async function bulkAssign(body: BulkAssignBody) {
  // Validate every intern actually exists and has STAFF / ADMIN role.
  const interns = await prisma.user.findMany({
    where: { id: { in: body.internIds } },
    select: { id: true, role: true },
  });
  if (interns.length !== body.internIds.length) {
    throw HttpError.badRequest('One or more intern IDs do not exist');
  }
  const allEligible = interns.every((u) => ['STAFF', 'ADMIN', 'SELLER'].includes(u.role));
  if (!allEligible) {
    throw HttpError.badRequest(
      'All selected interns must have role STAFF (or ADMIN). Assign them the products.image-only capability via /admin/staff first.',
    );
  }

  // Find products to assign. Fetch IDs only — the assign loop just
  // needs them to issue updates round-robin.
  const candidates = await prisma.product.findMany({
    where: { assignedInternId: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, images: true },
  });
  const filtered = candidates
    .filter((p) => (body.scope === 'all-unassigned' ? true : p.images.length < 3))
    .map((p) => p.id);

  if (filtered.length === 0) return { assigned: 0, perIntern: {} };

  // Round-robin assign. We do this in batches of (n_interns × 25)
  // updates per transaction so a 900-product split runs in under 40
  // round trips.
  const perIntern = new Map<string, number>(body.internIds.map((id) => [id, 0]));
  const batchSize = body.internIds.length * 25;
  for (let offset = 0; offset < filtered.length; offset += batchSize) {
    const batch = filtered.slice(offset, offset + batchSize);
    await prisma.$transaction(
      batch.map((productId, i) => {
        const internId = body.internIds[(offset + i) % body.internIds.length];
        perIntern.set(internId, (perIntern.get(internId) ?? 0) + 1);
        return prisma.product.update({
          where: { id: productId, assignedInternId: null }, // safety net
          data: { assignedInternId: internId },
        });
      }),
    );
  }

  return {
    assigned: filtered.length,
    perIntern: Object.fromEntries(perIntern),
  };
}

export async function reassign(body: ReassignBody) {
  let productIds = body.productIds ?? [];

  if (productIds.length === 0) {
    if (!body.fromInternId) {
      throw HttpError.badRequest(
        'Provide either productIds OR fromInternId to define what to move.',
      );
    }
    const where: Prisma.ProductWhereInput = { assignedInternId: body.fromInternId };
    if (body.mode === 'unstarted') {
      // Exclude products that already have any submission from this
      // intern (PENDING or APPROVED), so we don't break payment
      // attribution mid-flight.
      where.imageSubmissions = {
        none: { internId: body.fromInternId },
      };
    }
    const rows = await prisma.product.findMany({ where, select: { id: true } });
    productIds = rows.map((r) => r.id);
  }

  if (productIds.length === 0) return { moved: 0, perIntern: {}, returnedToPool: 0 };

  if (!body.toInternIds || body.toInternIds.length === 0) {
    // Send back to the unassigned pool.
    const r = await prisma.product.updateMany({
      where: { id: { in: productIds } },
      data: { assignedInternId: null },
    });
    return { moved: r.count, perIntern: {}, returnedToPool: r.count };
  }

  // Round-robin across the destination interns.
  const interns = body.toInternIds;
  const perIntern = new Map<string, number>(interns.map((id) => [id, 0]));
  await prisma.$transaction(
    productIds.map((id, i) => {
      const internId = interns[i % interns.length];
      perIntern.set(internId, (perIntern.get(internId) ?? 0) + 1);
      return prisma.product.update({
        where: { id },
        data: { assignedInternId: internId },
      });
    }),
  );

  return {
    moved: productIds.length,
    perIntern: Object.fromEntries(perIntern),
    returnedToPool: 0,
  };
}

/**
 * Per-intern stats for the admin dashboard. Approved count drives
 * payment, pending is what's in the review queue, rejected is the
 * count of rework outstanding.
 */
export async function getInternProgress() {
  const interns = await prisma.user.findMany({
    where: { role: { in: ['STAFF', 'ADMIN', 'SELLER'] } },
    select: { id: true, name: true, email: true, role: true },
  });

  const productCounts = await prisma.product.groupBy({
    by: ['assignedInternId'],
    where: { assignedInternId: { in: interns.map((i) => i.id) } },
    _count: { _all: true },
  });
  const assignedById = new Map(productCounts.map((g) => [g.assignedInternId, g._count._all]));

  const submissionCounts = await prisma.productImageSubmission.groupBy({
    by: ['internId', 'status'],
    where: { internId: { in: interns.map((i) => i.id) } },
    _count: { _all: true },
  });
  const subsByIntern = new Map<string, { approved: number; pending: number; rejected: number }>();
  for (const i of interns) {
    subsByIntern.set(i.id, { approved: 0, pending: 0, rejected: 0 });
  }
  for (const g of submissionCounts) {
    const rec = subsByIntern.get(g.internId);
    if (!rec) continue;
    if (g.status === 'APPROVED') rec.approved = g._count._all;
    else if (g.status === 'PENDING_REVIEW') rec.pending = g._count._all;
    else if (g.status === 'REJECTED') rec.rejected = g._count._all;
  }

  // Filter to only show interns who actually have something assigned
  // OR have ever submitted — keeps the dashboard signal-to-noise high.
  const items = interns
    .map((i) => {
      const s = subsByIntern.get(i.id) ?? { approved: 0, pending: 0, rejected: 0 };
      const assigned = assignedById.get(i.id) ?? 0;
      const todo = Math.max(0, assigned - s.approved - s.pending - s.rejected);
      return {
        id: i.id,
        name: i.name,
        email: i.email,
        role: i.role,
        assigned,
        todo,
        pending: s.pending,
        approved: s.approved,
        rejected: s.rejected,
      };
    })
    .filter((i) => i.assigned > 0 || i.approved > 0 || i.pending > 0 || i.rejected > 0)
    .sort((a, b) => b.approved - a.approved);

  return { items };
}

export async function listSubmissionsForReview(
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'ALL' = 'PENDING_REVIEW',
  internId?: string,
) {
  const where: Prisma.ProductImageSubmissionWhereInput = {};
  if (status !== 'ALL') where.status = status;
  if (internId) where.internId = internId;
  const subs = await prisma.productImageSubmission.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      product: { select: { id: true, slug: true, name: true, brand: true, images: true } },
      intern: { select: { id: true, name: true, email: true } },
    },
  });
  return { items: subs };
}

/**
 * Approve or reject a submission. Approve writes the front/back/side
 * (+ extras) onto Product.images, replacing whatever was there, so the
 * intern's curated set becomes the live image gallery. Reject stores
 * the reason for the intern to read.
 */
export async function reviewSubmission(
  submissionId: string,
  body: ReviewSubmissionBody,
  reviewerId: string,
) {
  const sub = await prisma.productImageSubmission.findUnique({
    where: { id: submissionId },
    select: { id: true, productId: true, status: true },
  });
  if (!sub) throw HttpError.notFound('Submission not found');
  if (sub.status !== 'PENDING_REVIEW') {
    throw HttpError.badRequest(
      `Submission has already been ${sub.status === 'APPROVED' ? 'approved' : 'rejected'}.`,
    );
  }

  if (body.action === 'reject') {
    return prisma.productImageSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'REJECTED',
        rejectionReason: body.reason,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    });
  }

  // Approve — read the full submission so we can publish images.
  const full = await prisma.productImageSubmission.findUnique({
    where: { id: submissionId },
    select: {
      frontImageUrl: true,
      backImageUrl: true,
      sideImageUrl: true,
      additionalImages: true,
    },
  });
  if (!full) throw HttpError.notFound('Submission disappeared mid-review');

  const newImages = [
    full.frontImageUrl,
    full.backImageUrl,
    full.sideImageUrl,
    ...full.additionalImages,
  ];

  const [updated] = await prisma.$transaction([
    prisma.productImageSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'APPROVED',
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    }),
    prisma.product.update({
      where: { id: sub.productId },
      data: { images: newImages },
    }),
  ]);
  return updated;
}
