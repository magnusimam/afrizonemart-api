import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { getDefaultPayRate } from '../intern/service';
import { adminCreateDocument } from '../documents/service';
import type {
  ListDocumentSubmissionsQuery,
  PatchDocumentSubmissionBody,
  ReviewDocumentSubmissionBody,
  UpsertDocumentSubmissionBody,
} from './schema';

/**
 * Civic Library intern document-submission flow (2026-07-30).
 *
 * Structurally identical to `product-submissions/service.ts`: an
 * intern with `documents.submit` drafts a government document
 * (title, country, docType, source PDF); a reviewer with
 * `intern.review` approves (creates the live GovDocument) or rejects
 * with a reason. Pay uses the same flat `intern.pay_rate_ngn`
 * snapshot per submission so the payout flow can treat image /
 * product / document submissions uniformly.
 *
 * No DRAFT status — creating a submission means submitting it for
 * review. A REJECTED one can be edited + resubmitted (flips back to
 * PENDING_REVIEW).
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
  title: true,
  slug: true,
  country: true,
  docType: true,
  description: true,
  issuingBody: true,
  officialSourceUrl: true,
  publishedDate: true,
  fileUrl: true,
  fileSizeBytes: true,
  rejectionReason: true,
  reviewedById: true,
  reviewedAt: true,
  createdDocumentId: true,
  payRate: true,
  payoutId: true,
  createdAt: true,
  updatedAt: true,
} as const;

// ----- Intern side -----

export async function createDocumentSubmission(
  internId: string,
  body: UpsertDocumentSubmissionBody,
) {
  const payRate = await getDefaultPayRate();
  return prisma.documentSubmission.create({
    data: {
      internId,
      status: 'PENDING_REVIEW',
      title: body.title,
      slug: body.slug || slugify(body.title),
      country: body.country.toUpperCase(),
      docType: body.docType,
      description: body.description ?? null,
      issuingBody: body.issuingBody ?? null,
      officialSourceUrl: body.officialSourceUrl ?? null,
      publishedDate: body.publishedDate ? new Date(body.publishedDate) : null,
      fileUrl: body.fileUrl,
      fileSizeBytes: body.fileSizeBytes ?? null,
      payRate,
    },
    select: SUBMISSION_SELECT,
  });
}

/**
 * Edit an intern's own submission. Allowed only while PENDING_REVIEW
 * (fix before review) or REJECTED (rework — resubmits).
 */
export async function updateDocumentSubmission(
  internId: string,
  submissionId: string,
  body: PatchDocumentSubmissionBody,
) {
  const existing = await prisma.documentSubmission.findUnique({
    where: { id: submissionId },
    select: { id: true, internId: true, status: true },
  });
  if (!existing || existing.internId !== internId) {
    throw HttpError.notFound('Submission not found');
  }
  if (existing.status === 'APPROVED') {
    throw HttpError.badRequest(
      'This submission was already approved and published — edit the live document instead.',
    );
  }

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.slug !== undefined) data.slug = body.slug || (body.title ? slugify(body.title) : undefined);
  if (body.country !== undefined) data.country = body.country.toUpperCase();
  if (body.docType !== undefined) data.docType = body.docType;
  if (body.description !== undefined) data.description = body.description ?? null;
  if (body.issuingBody !== undefined) data.issuingBody = body.issuingBody ?? null;
  if (body.officialSourceUrl !== undefined) data.officialSourceUrl = body.officialSourceUrl ?? null;
  if (body.publishedDate !== undefined) {
    data.publishedDate = body.publishedDate ? new Date(body.publishedDate) : null;
  }
  if (body.fileUrl !== undefined) data.fileUrl = body.fileUrl;
  if (body.fileSizeBytes !== undefined) data.fileSizeBytes = body.fileSizeBytes ?? null;

  // Resubmitting a rejected draft clears the rejection + re-queues it.
  if (existing.status === 'REJECTED') {
    data.status = 'PENDING_REVIEW';
    data.rejectionReason = null;
    data.reviewedAt = null;
    data.reviewedById = null;
  }

  return prisma.documentSubmission.update({
    where: { id: submissionId },
    data,
    select: SUBMISSION_SELECT,
  });
}

export async function listMyDocumentSubmissions(internId: string) {
  const items = await prisma.documentSubmission.findMany({
    where: { internId },
    orderBy: { createdAt: 'desc' },
    select: SUBMISSION_SELECT,
  });
  return { items };
}

export async function getMyDocumentSubmission(internId: string, submissionId: string) {
  const sub = await prisma.documentSubmission.findUnique({
    where: { id: submissionId },
    select: SUBMISSION_SELECT,
  });
  if (!sub || sub.internId !== internId) throw HttpError.notFound('Submission not found');
  return sub;
}

// ----- Admin / reviewer side -----

export async function listDocumentSubmissionsForReview(q: ListDocumentSubmissionsQuery) {
  const items = await prisma.documentSubmission.findMany({
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

export async function getDocumentSubmissionForReview(submissionId: string) {
  const sub = await prisma.documentSubmission.findUnique({
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
 * Approve or reject a document submission.
 *
 * Approve: creates the live GovDocument via `adminCreateDocument`
 * (same 409-on-slug-clash behavior as products), then stamps the
 * submission APPROVED with the new document id + reviewer + timestamp.
 * Reject: stores the reason; the intern can edit + resubmit.
 * Self-review is blocked — a reviewer can't approve their own draft.
 */
export async function reviewDocumentSubmission(
  submissionId: string,
  body: ReviewDocumentSubmissionBody,
  reviewerId: string,
) {
  const sub = await prisma.documentSubmission.findUnique({
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
    return prisma.documentSubmission.update({
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

  // Approve → create the live document. adminCreateDocument throws a
  // 409 if the slug is taken; let that surface to the reviewer.
  const created = await adminCreateDocument({
    slug: sub.slug,
    title: sub.title,
    country: sub.country,
    docType: sub.docType,
    description: sub.description ?? null,
    issuingBody: sub.issuingBody ?? null,
    officialSourceUrl: sub.officialSourceUrl ?? null,
    publishedDate: sub.publishedDate ? sub.publishedDate.toISOString() : null,
    fileUrl: sub.fileUrl,
    fileSizeBytes: sub.fileSizeBytes ?? null,
    status: 'PUBLISHED',
  });

  return prisma.documentSubmission.update({
    where: { id: submissionId },
    data: {
      status: 'APPROVED',
      createdDocumentId: created.id,
      reviewedById: reviewerId,
      reviewedAt: new Date(),
    },
    select: SUBMISSION_SELECT,
  });
}
