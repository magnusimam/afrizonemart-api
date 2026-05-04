import type { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { validateSectionConfig } from './section-types';
import type {
  PartialPageBody,
  PartialSectionBody,
  PublishPageBody,
  ReorderSectionsBody,
  RevertToRevisionBody,
  UpsertPageBody,
  UpsertSectionBody,
} from './schema';

const REVISIONS_PER_PAGE = 50;

// -------- Public (storefront) -----------------------------------------

/**
 * Returns the live (published) section list for a slug. The storefront
 * calls this on every page render.
 *
 * Reads from the **latest PageRevision snapshot** rather than current
 * PageSection rows — that's what gives us a true draft/publish
 * workflow. Admin edits update PageSection immediately (so the builder
 * UI reflects them), but the public never sees those edits until
 * adminPublishPage writes a new revision. Reverting is just publishing
 * an older revision.
 *
 * We respect:
 *   - section.visible (kill switch)
 *   - section.startsAt / endsAt (campaign window)
 *   - section.countries (geo targeting via the geo cookie)
 */
export async function getPublishedPage(slug: string, country: string | null) {
  const page = await prisma.page.findUnique({
    where: { slug },
    include: {
      revisions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  if (!page) return null;
  if (!page.publishedAt) return null;
  if (page.revisions.length === 0) return null;

  const snapshot = page.revisions[0].snapshot as unknown as Array<{
    type: string;
    position: number;
    visible: boolean;
    headline: string | null;
    subheadline: string | null;
    accentColor: string | null;
    config: unknown;
    startsAt: string | null;
    endsAt: string | null;
    countries: string[];
  }>;
  if (!Array.isArray(snapshot)) return null;

  const now = new Date();
  const visible = snapshot.filter((s) => {
    if (!s.visible) return false;
    if (s.startsAt && new Date(s.startsAt) > now) return false;
    if (s.endsAt && new Date(s.endsAt) < now) return false;
    if (s.countries.length > 0) {
      if (!country) return false;
      if (!s.countries.includes(country.toUpperCase())) return false;
    }
    return true;
  });

  // Sort + serialise. Snapshot positions are already correct since
  // adminPublishPage writes them in order, but a sort keeps us safe
  // against legacy revisions written by earlier code paths.
  visible.sort((a, b) => a.position - b.position);

  return {
    slug: page.slug,
    title: page.title,
    publishedAt: page.publishedAt,
    sections: visible.map((s, idx) => ({
      // Snapshots don't carry IDs (sections may have been deleted);
      // synthesise stable per-render IDs so React keys are happy.
      id: `${page.id}-snapshot-${idx}`,
      type: s.type,
      position: s.position,
      visible: s.visible,
      headline: s.headline,
      subheadline: s.subheadline,
      accentColor: s.accentColor,
      config: s.config,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      countries: s.countries,
    })),
  };
}

function serializeSection(s: {
  id: string;
  type: string;
  position: number;
  visible: boolean;
  headline: string | null;
  subheadline: string | null;
  accentColor: string | null;
  config: Prisma.JsonValue;
  startsAt: Date | null;
  endsAt: Date | null;
  countries: string[];
}) {
  return {
    id: s.id,
    type: s.type,
    position: s.position,
    visible: s.visible,
    headline: s.headline,
    subheadline: s.subheadline,
    accentColor: s.accentColor,
    config: s.config,
    startsAt: s.startsAt?.toISOString() ?? null,
    endsAt: s.endsAt?.toISOString() ?? null,
    countries: s.countries,
  };
}

// -------- Admin -------------------------------------------------------

export async function adminListPages() {
  const pages = await prisma.page.findMany({
    orderBy: { slug: 'asc' },
    include: {
      _count: { select: { sections: true, revisions: true } },
    },
  });
  return {
    items: pages.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      description: p.description,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      sectionCount: p._count.sections,
      revisionCount: p._count.revisions,
      updatedAt: p.updatedAt.toISOString(),
    })),
  };
}

export async function adminGetPage(idOrSlug: string) {
  const page = await prisma.page.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: {
      sections: { orderBy: { position: 'asc' } },
    },
  });
  if (!page) throw HttpError.notFound('Page not found');
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    description: page.description,
    publishedAt: page.publishedAt?.toISOString() ?? null,
    sections: page.sections.map(serializeSection),
  };
}

export async function adminCreatePage(body: UpsertPageBody) {
  const exists = await prisma.page.findUnique({ where: { slug: body.slug }, select: { id: true } });
  if (exists) throw HttpError.conflict(`A page with slug "${body.slug}" already exists`);
  const page = await prisma.page.create({
    data: {
      slug: body.slug,
      title: body.title,
      description: body.description ?? null,
    },
  });
  return adminGetPage(page.id);
}

export async function adminUpdatePage(id: string, body: PartialPageBody) {
  const exists = await prisma.page.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw HttpError.notFound('Page not found');
  if (body.slug) {
    const clash = await prisma.page.findFirst({
      where: { slug: body.slug, NOT: { id } },
      select: { id: true },
    });
    if (clash) throw HttpError.conflict(`Slug "${body.slug}" is already in use`);
  }
  await prisma.page.update({
    where: { id },
    data: {
      ...(body.slug !== undefined && { slug: body.slug }),
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description ?? null }),
    },
  });
  return adminGetPage(id);
}

export async function adminDeletePage(id: string): Promise<void> {
  const exists = await prisma.page.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw HttpError.notFound('Page not found');
  // Cascading delete handles sections + revisions.
  await prisma.page.delete({ where: { id } });
}

// -------- Sections ----------------------------------------------------

export async function adminCreateSection(pageId: string, body: UpsertSectionBody) {
  const page = await prisma.page.findUnique({ where: { id: pageId }, select: { id: true } });
  if (!page) throw HttpError.notFound('Page not found');

  const config = validateSectionConfig(body.type, body.config ?? {});

  // If position omitted, append to the end.
  let position = body.position;
  if (position === undefined) {
    const last = await prisma.pageSection.findFirst({
      where: { pageId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    position = (last?.position ?? -1) + 1;
  }

  const section = await prisma.pageSection.create({
    data: {
      pageId,
      type: body.type,
      position,
      visible: body.visible ?? true,
      headline: body.headline ?? null,
      subheadline: body.subheadline ?? null,
      accentColor: body.accentColor ?? null,
      config: config as Prisma.InputJsonValue,
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      countries: body.countries ?? [],
    },
  });
  return serializeSection(section);
}

export async function adminUpdateSection(sectionId: string, body: PartialSectionBody) {
  const existing = await prisma.pageSection.findUnique({ where: { id: sectionId } });
  if (!existing) throw HttpError.notFound('Section not found');

  // If type or config changed, re-validate against the (possibly new) type.
  let validatedConfig: Prisma.InputJsonValue | undefined;
  if (body.config !== undefined || body.type !== undefined) {
    const type = body.type ?? existing.type;
    const config = body.config !== undefined ? body.config : existing.config;
    validatedConfig = validateSectionConfig(type, config) as Prisma.InputJsonValue;
  }

  const updated = await prisma.pageSection.update({
    where: { id: sectionId },
    data: {
      ...(body.type !== undefined && { type: body.type }),
      ...(body.position !== undefined && { position: body.position }),
      ...(body.visible !== undefined && { visible: body.visible }),
      ...(body.headline !== undefined && { headline: body.headline ?? null }),
      ...(body.subheadline !== undefined && { subheadline: body.subheadline ?? null }),
      ...(body.accentColor !== undefined && { accentColor: body.accentColor ?? null }),
      ...(validatedConfig !== undefined && { config: validatedConfig }),
      ...(body.startsAt !== undefined && { startsAt: body.startsAt ? new Date(body.startsAt) : null }),
      ...(body.endsAt !== undefined && { endsAt: body.endsAt ? new Date(body.endsAt) : null }),
      ...(body.countries !== undefined && { countries: body.countries }),
    },
  });
  return serializeSection(updated);
}

export async function adminDeleteSection(sectionId: string): Promise<void> {
  const existing = await prisma.pageSection.findUnique({
    where: { id: sectionId },
    select: { id: true },
  });
  if (!existing) throw HttpError.notFound('Section not found');
  await prisma.pageSection.delete({ where: { id: sectionId } });
}

export async function adminReorderSections(pageId: string, body: ReorderSectionsBody) {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: { sections: { select: { id: true } } },
  });
  if (!page) throw HttpError.notFound('Page not found');

  // Validate all IDs belong to the page (no smuggling other-page IDs).
  const ownIds = new Set(page.sections.map((s) => s.id));
  for (const id of body.ids) {
    if (!ownIds.has(id)) {
      throw HttpError.badRequest(`Section "${id}" does not belong to page "${pageId}"`);
    }
  }
  if (body.ids.length !== page.sections.length) {
    throw HttpError.badRequest('Reorder list must include every section on the page');
  }

  await prisma.$transaction(
    body.ids.map((id, idx) =>
      prisma.pageSection.update({
        where: { id },
        data: { position: idx },
      }),
    ),
  );
  return adminGetPage(pageId);
}

// -------- Publish + revisions ----------------------------------------

interface PublishContext {
  authorId?: string | null;
  authorEmail?: string | null;
}

export async function adminPublishPage(
  pageId: string,
  body: PublishPageBody,
  ctx: PublishContext = {},
) {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: { sections: { orderBy: { position: 'asc' } } },
  });
  if (!page) throw HttpError.notFound('Page not found');

  const snapshot = page.sections.map((s) => ({
    type: s.type,
    position: s.position,
    visible: s.visible,
    headline: s.headline,
    subheadline: s.subheadline,
    accentColor: s.accentColor,
    config: s.config,
    startsAt: s.startsAt?.toISOString() ?? null,
    endsAt: s.endsAt?.toISOString() ?? null,
    countries: s.countries,
  }));

  await prisma.$transaction([
    prisma.page.update({
      where: { id: pageId },
      data: { publishedAt: new Date() },
    }),
    prisma.pageRevision.create({
      data: {
        pageId,
        snapshot: snapshot as Prisma.InputJsonValue,
        authorId: ctx.authorId ?? null,
        authorEmail: ctx.authorEmail ?? null,
        note: body.note ?? null,
      },
    }),
  ]);

  // Prune older revisions beyond the retention window. Keeps the
  // revisions table from growing unbounded for active pages.
  const stale = await prisma.pageRevision.findMany({
    where: { pageId },
    orderBy: { createdAt: 'desc' },
    skip: REVISIONS_PER_PAGE,
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.pageRevision.deleteMany({
      where: { id: { in: stale.map((r) => r.id) } },
    });
  }

  return adminGetPage(pageId);
}

export async function adminListRevisions(pageId: string) {
  const page = await prisma.page.findUnique({ where: { id: pageId }, select: { id: true } });
  if (!page) throw HttpError.notFound('Page not found');
  const revisions = await prisma.pageRevision.findMany({
    where: { pageId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      authorEmail: true,
      note: true,
      createdAt: true,
    },
  });
  return {
    items: revisions.map((r) => ({
      id: r.id,
      authorEmail: r.authorEmail,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export async function adminRevertToRevision(
  pageId: string,
  body: RevertToRevisionBody,
  ctx: PublishContext = {},
) {
  const revision = await prisma.pageRevision.findFirst({
    where: { id: body.revisionId, pageId },
    select: { id: true, snapshot: true },
  });
  if (!revision) throw HttpError.notFound('Revision not found for this page');

  const snapshot = revision.snapshot as unknown as Array<{
    type: string;
    position: number;
    visible: boolean;
    headline: string | null;
    subheadline: string | null;
    accentColor: string | null;
    config: Prisma.JsonValue;
    startsAt: string | null;
    endsAt: string | null;
    countries: string[];
  }>;
  if (!Array.isArray(snapshot)) {
    throw HttpError.badRequest('Revision snapshot is malformed');
  }

  // Atomic restore: wipe current sections, write snapshot rows back,
  // record a new revision noting the revert.
  await prisma.$transaction([
    prisma.pageSection.deleteMany({ where: { pageId } }),
    ...snapshot.map((s) =>
      prisma.pageSection.create({
        data: {
          pageId,
          type: s.type,
          position: s.position,
          visible: s.visible,
          headline: s.headline,
          subheadline: s.subheadline,
          accentColor: s.accentColor,
          config: s.config as Prisma.InputJsonValue,
          startsAt: s.startsAt ? new Date(s.startsAt) : null,
          endsAt: s.endsAt ? new Date(s.endsAt) : null,
          countries: s.countries,
        },
      }),
    ),
    prisma.pageRevision.create({
      data: {
        pageId,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        authorId: ctx.authorId ?? null,
        authorEmail: ctx.authorEmail ?? null,
        note: `Reverted to revision ${body.revisionId}`,
      },
    }),
  ]);

  return adminGetPage(pageId);
}
