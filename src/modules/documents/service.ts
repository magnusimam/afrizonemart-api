import type { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { eventBus } from '@/infra/eventBus';
import type {
  AdminListDocumentsQuery,
  ListDocumentsQuery,
  PartialDocumentBody,
  UpsertDocumentBody,
} from './schema';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function serializePublic(d: {
  id: string;
  slug: string;
  title: string;
  country: string;
  docType: string;
  description: string | null;
  issuingBody: string | null;
  officialSourceUrl: string | null;
  publishedDate: Date | null;
  fileUrl: string;
  fileSizeBytes: number | null;
  downloadCount: number;
  createdAt: Date;
}) {
  return {
    id: d.id,
    slug: d.slug,
    title: d.title,
    country: d.country,
    docType: d.docType,
    description: d.description,
    issuingBody: d.issuingBody,
    officialSourceUrl: d.officialSourceUrl,
    publishedDate: d.publishedDate?.toISOString() ?? null,
    fileUrl: d.fileUrl,
    fileSizeBytes: d.fileSizeBytes,
    downloadCount: d.downloadCount,
    createdAt: d.createdAt.toISOString(),
  };
}

// -------- Public -----------------------------------------------------

export async function listPublishedDocuments(query: ListDocumentsQuery) {
  const where: Prisma.GovDocumentWhereInput = { status: 'PUBLISHED' };
  if (query.country) where.country = query.country.toUpperCase();
  if (query.docType) where.docType = query.docType;
  if (query.q) {
    where.OR = [
      { title: { contains: query.q, mode: 'insensitive' } },
      { issuingBody: { contains: query.q, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.govDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.govDocument.count({ where }),
  ]);

  return {
    items: items.map(serializePublic),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function getPublishedDocument(slug: string) {
  const doc = await prisma.govDocument.findUnique({ where: { slug } });
  if (!doc || doc.status !== 'PUBLISHED') return null;
  return serializePublic(doc);
}

/**
 * Increment the denormalized download counter and emit
 * `document.downloaded` for any future subscriber. No auth — Civic
 * Library downloads are anonymous by design (Magnus: "free means
 * frictionless"), so unlike order/payment events this has no userId
 * to attach and deliberately isn't wired into the PostHog dispatcher
 * (`track()` requires a real distinctId; we don't want to invent a
 * shared "anonymous" identity that would misrepresent unique users in
 * dashboards). downloadCount on the row is the source of truth for
 * popularity.
 */
export async function trackDocumentDownload(id: string): Promise<void> {
  const doc = await prisma.govDocument.findUnique({
    where: { id },
    select: { id: true, status: true, country: true, docType: true },
  });
  if (!doc || doc.status !== 'PUBLISHED') throw HttpError.notFound('Document not found');

  await prisma.govDocument.update({
    where: { id },
    data: { downloadCount: { increment: 1 } },
  });

  await eventBus.emit('document.downloaded', {
    documentId: doc.id,
    country: doc.country,
    docType: doc.docType,
  });
}

// -------- Admin ------------------------------------------------------

export async function adminListDocuments(query: AdminListDocumentsQuery) {
  const where: Prisma.GovDocumentWhereInput = {};
  if (query.status !== 'ALL') where.status = query.status;
  if (query.country) where.country = query.country.toUpperCase();
  if (query.docType) where.docType = query.docType;
  if (query.q) {
    where.OR = [
      { title: { contains: query.q, mode: 'insensitive' } },
      { slug: { contains: query.q, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.govDocument.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.govDocument.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function adminGetDocument(idOrSlug: string) {
  const doc = await prisma.govDocument.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
  });
  if (!doc) throw HttpError.notFound('Document not found');
  return doc;
}

/**
 * Shared create path — used by the admin "new document" form AND by
 * the document-submissions review flow on approval (mirrors
 * `adminCreateProduct` being reused from `reviewProductSubmission`).
 * Throws a 409 if the slug is already in use.
 */
export async function adminCreateDocument(body: UpsertDocumentBody) {
  const slug = body.slug ?? slugify(body.title);
  if (!slug) throw HttpError.badRequest('Could not derive slug from title');
  const exists = await prisma.govDocument.findUnique({ where: { slug }, select: { id: true } });
  if (exists) throw HttpError.conflict(`A document with slug "${slug}" already exists`);

  return prisma.govDocument.create({
    data: {
      slug,
      title: body.title,
      country: body.country.toUpperCase(),
      docType: body.docType,
      description: body.description ?? null,
      issuingBody: body.issuingBody ?? null,
      officialSourceUrl: body.officialSourceUrl ?? null,
      publishedDate: body.publishedDate ? new Date(body.publishedDate) : null,
      fileUrl: body.fileUrl,
      fileSizeBytes: body.fileSizeBytes ?? null,
      status: body.status,
    },
  });
}

export async function adminUpdateDocument(id: string, body: PartialDocumentBody) {
  const existing = await prisma.govDocument.findUnique({ where: { id } });
  if (!existing) throw HttpError.notFound('Document not found');

  if (body.slug && body.slug !== existing.slug) {
    const clash = await prisma.govDocument.findFirst({
      where: { slug: body.slug, NOT: { id } },
      select: { id: true },
    });
    if (clash) throw HttpError.conflict(`Slug "${body.slug}" is already in use`);
  }

  return prisma.govDocument.update({
    where: { id },
    data: {
      ...(body.slug !== undefined && { slug: body.slug }),
      ...(body.title !== undefined && { title: body.title }),
      ...(body.country !== undefined && { country: body.country.toUpperCase() }),
      ...(body.docType !== undefined && { docType: body.docType }),
      ...(body.description !== undefined && { description: body.description ?? null }),
      ...(body.issuingBody !== undefined && { issuingBody: body.issuingBody ?? null }),
      ...(body.officialSourceUrl !== undefined && {
        officialSourceUrl: body.officialSourceUrl ?? null,
      }),
      ...(body.publishedDate !== undefined && {
        publishedDate: body.publishedDate ? new Date(body.publishedDate) : null,
      }),
      ...(body.fileUrl !== undefined && { fileUrl: body.fileUrl }),
      ...(body.fileSizeBytes !== undefined && { fileSizeBytes: body.fileSizeBytes ?? null }),
      ...(body.status !== undefined && { status: body.status }),
    },
  });
}

export async function adminDeleteDocument(id: string): Promise<void> {
  const exists = await prisma.govDocument.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw HttpError.notFound('Document not found');
  await prisma.govDocument.delete({ where: { id } });
}
