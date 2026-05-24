import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { getDefaultPayRate } from '../intern/service';
import { adminCreateProduct } from '../products/admin.service';
import type {
  ListProductSubmissionsQuery,
  PatchProductSubmissionBody,
  ReviewProductSubmissionBody,
  UpsertProductSubmissionBody,
} from './schema';

/**
 * Intern full-product submission flow (2026-05-24).
 *
 * An intern with `products.submit` drafts a complete product; a
 * reviewer with `intern.review` approves (which creates the live
 * Product) or rejects with a reason. Pay uses the same flat
 * `intern.pay_rate_ngn` snapshotted per submission, so the payout
 * flow (PR 1b) can treat product + image submissions uniformly.
 *
 * No DRAFT status — like the image flow, creating a submission means
 * submitting it for review. A REJECTED one can be edited + resubmitted
 * (flips back to PENDING_REVIEW).
 */

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const SUBMISSION_SELECT = {
  id: true,
  internId: true,
  status: true,
  name: true,
  slug: true,
  brand: true,
  shortDescription: true,
  description: true,
  ingredients: true,
  price: true,
  comparePrice: true,
  origin: true,
  weightKg: true,
  images: true,
  attributes: true,
  categorySlug: true,
  rejectionReason: true,
  reviewedById: true,
  reviewedAt: true,
  createdProductId: true,
  payRate: true,
  payoutId: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ----- Intern side -----

export async function createProductSubmission(
  internId: string,
  body: UpsertProductSubmissionBody,
) {
  const payRate = await getDefaultPayRate();
  return prisma.productSubmission.create({
    data: {
      internId,
      status: 'PENDING_REVIEW',
      name: body.name,
      slug: body.slug || slugify(body.name),
      brand: body.brand ?? null,
      shortDescription: body.shortDescription ?? null,
      description: body.description ?? null,
      ingredients: body.ingredients ?? null,
      price: body.price,
      comparePrice: body.comparePrice ?? null,
      origin: body.origin ?? null,
      weightKg: body.weightKg ?? null,
      images: body.images,
      attributes: body.attributes,
      categorySlug: body.categorySlug ?? null,
      payRate,
    },
    select: SUBMISSION_SELECT,
  });
}

/**
 * Edit an intern's own submission. Allowed only while it's
 * PENDING_REVIEW (fix a typo before review) or REJECTED (rework).
 * Editing a REJECTED submission re-submits it: status flips back to
 * PENDING_REVIEW and the rejection reason clears.
 */
export async function updateProductSubmission(
  internId: string,
  submissionId: string,
  body: PatchProductSubmissionBody,
) {
  const existing = await prisma.productSubmission.findUnique({
    where: { id: submissionId },
    select: { id: true, internId: true, status: true },
  });
  if (!existing || existing.internId !== internId) {
    throw HttpError.notFound('Submission not found');
  }
  if (existing.status === 'APPROVED') {
    throw HttpError.badRequest(
      'This submission was already approved and published — edit the live product instead.',
    );
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.slug !== undefined) data.slug = body.slug || (body.name ? slugify(body.name) : undefined);
  if (body.brand !== undefined) data.brand = body.brand ?? null;
  if (body.shortDescription !== undefined) data.shortDescription = body.shortDescription ?? null;
  if (body.description !== undefined) data.description = body.description ?? null;
  if (body.ingredients !== undefined) data.ingredients = body.ingredients ?? null;
  if (body.price !== undefined) data.price = body.price;
  if (body.comparePrice !== undefined) data.comparePrice = body.comparePrice ?? null;
  if (body.origin !== undefined) data.origin = body.origin ?? null;
  if (body.weightKg !== undefined) data.weightKg = body.weightKg ?? null;
  if (body.images !== undefined) data.images = body.images;
  if (body.attributes !== undefined) data.attributes = body.attributes;
  if (body.categorySlug !== undefined) data.categorySlug = body.categorySlug ?? null;

  // Resubmitting a rejected draft clears the rejection + re-queues it.
  if (existing.status === 'REJECTED') {
    data.status = 'PENDING_REVIEW';
    data.rejectionReason = null;
    data.reviewedAt = null;
    data.reviewedById = null;
  }

  return prisma.productSubmission.update({
    where: { id: submissionId },
    data,
    select: SUBMISSION_SELECT,
  });
}

export async function listMyProductSubmissions(internId: string) {
  const items = await prisma.productSubmission.findMany({
    where: { internId },
    orderBy: { createdAt: 'desc' },
    select: SUBMISSION_SELECT,
  });
  return { items };
}

export async function getMyProductSubmission(internId: string, submissionId: string) {
  const sub = await prisma.productSubmission.findUnique({
    where: { id: submissionId },
    select: SUBMISSION_SELECT,
  });
  if (!sub || sub.internId !== internId) throw HttpError.notFound('Submission not found');
  return sub;
}

// ----- Admin / reviewer side -----

export async function listProductSubmissionsForReview(q: ListProductSubmissionsQuery) {
  const items = await prisma.productSubmission.findMany({
    where: {
      ...(q.status ? { status: q.status } : {}),
      ...(q.internId ? { internId: q.internId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: q.limit,
    select: {
      ...SUBMISSION_SELECT,
      intern: { select: { id: true, name: true, email: true } },
    },
  });
  return { items };
}

export async function getProductSubmissionForReview(submissionId: string) {
  const sub = await prisma.productSubmission.findUnique({
    where: { id: submissionId },
    select: {
      ...SUBMISSION_SELECT,
      intern: { select: { id: true, name: true, email: true } },
      reviewedBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!sub) throw HttpError.notFound('Submission not found');
  return sub;
}

/**
 * Approve or reject a product submission.
 *
 * Approve: creates the live Product from the staged fields (reusing
 * adminCreateProduct so variants, price history, and attribute
 * validation all run), then stamps the submission APPROVED with the
 * new product id + reviewer + timestamp. If the slug already exists
 * on a live product, surfaces a friendly conflict so the reviewer
 * can ask the intern to change it.
 *
 * Reject: stores the reason; the intern can edit + resubmit.
 *
 * Self-review is blocked — a reviewer can't approve their own draft.
 */
export async function reviewProductSubmission(
  submissionId: string,
  body: ReviewProductSubmissionBody,
  reviewerId: string,
) {
  const sub = await prisma.productSubmission.findUnique({
    where: { id: submissionId },
    select: SUBMISSION_SELECT,
  });
  if (!sub) throw HttpError.notFound('Submission not found');
  if (sub.status !== 'PENDING_REVIEW') {
    throw HttpError.badRequest(
      `Submission has already been ${sub.status === 'APPROVED' ? 'approved' : 'rejected'}.`,
    );
  }
  if (sub.internId === reviewerId) {
    throw HttpError.forbidden(
      "You can't review your own submission. Ask another reviewer to take it.",
    );
  }

  if (body.action === 'reject') {
    return prisma.productSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'REJECTED',
        rejectionReason: body.reason,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
      select: SUBMISSION_SELECT,
    });
  }

  // Approve → create the live product. adminCreateProduct throws a
  // 409 if the slug is taken; let that surface to the reviewer.
  const created = await adminCreateProduct(
    {
      slug: sub.slug,
      name: sub.name,
      brand: sub.brand ?? null,
      shortDescription: sub.shortDescription ?? null,
      description: sub.description ?? null,
      ingredients: sub.ingredients ?? null,
      price: sub.price,
      comparePrice: sub.comparePrice ?? null,
      origin: sub.origin ?? null,
      weightKg: sub.weightKg ?? null,
      inStock: true,
      rating: 0,
      reviewCount: 0,
      images: sub.images,
      attributes: (sub.attributes ?? {}) as Record<string, unknown>,
      categorySlug: sub.categorySlug ?? null,
    },
    reviewerId,
  );

  return prisma.productSubmission.update({
    where: { id: submissionId },
    data: {
      status: 'APPROVED',
      createdProductId: created.id,
      reviewedById: reviewerId,
      reviewedAt: new Date(),
    },
    select: SUBMISSION_SELECT,
  });
}
