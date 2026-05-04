import type { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import type {
  AdminListBlogPostsQuery,
  ListBlogPostsQuery,
  PartialBlogPostBody,
  UpsertBlogPostBody,
} from './schema';

/// 200 wpm is a common reading-time benchmark; counts plain words after
/// stripping HTML tags + collapsing whitespace.
function readingTimeMinutes(html: string): number {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = text ? text.split(' ').length : 0;
  return Math.max(1, Math.round(words / 200));
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function serializePublic(p: {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  heroImage: string | null;
  heroImageAlt: string | null;
  authorName: string | null;
  publishedAt: Date | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImage: string | null;
  tags: string[];
  readingTimeMin: number | null;
  createdAt: Date;
}) {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    heroImage: p.heroImage,
    heroImageAlt: p.heroImageAlt,
    authorName: p.authorName,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    metaTitle: p.metaTitle,
    metaDescription: p.metaDescription,
    ogImage: p.ogImage,
    tags: p.tags,
    readingTimeMin: p.readingTimeMin,
    createdAt: p.createdAt.toISOString(),
  };
}

function serializeAdmin(p: {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  heroImage: string | null;
  heroImageAlt: string | null;
  authorId: string | null;
  authorName: string | null;
  status: string;
  publishedAt: Date | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImage: string | null;
  tags: string[];
  readingTimeMin: number | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...serializePublic(p),
    content: p.content,
    authorId: p.authorId,
    status: p.status,
    updatedAt: p.updatedAt.toISOString(),
  };
}

// -------- Public -----------------------------------------------------

export async function listPublishedPosts(query: ListBlogPostsQuery) {
  const where: Prisma.BlogPostWhereInput = {
    status: 'PUBLISHED',
    publishedAt: { lte: new Date() },
  };
  if (query.tag) where.tags = { has: query.tag };
  if (query.q) {
    where.OR = [
      { title: { contains: query.q, mode: 'insensitive' } },
      { excerpt: { contains: query.q, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        slug: true,
        title: true,
        excerpt: true,
        heroImage: true,
        heroImageAlt: true,
        authorName: true,
        publishedAt: true,
        metaTitle: true,
        metaDescription: true,
        ogImage: true,
        tags: true,
        readingTimeMin: true,
        createdAt: true,
      },
    }),
    prisma.blogPost.count({ where }),
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

export async function getPublishedPost(slug: string) {
  const post = await prisma.blogPost.findUnique({ where: { slug } });
  if (!post || post.status !== 'PUBLISHED' || (post.publishedAt && post.publishedAt > new Date())) {
    return null;
  }
  return { ...serializePublic(post), content: post.content };
}

export async function listAllTags(): Promise<string[]> {
  /// Pull every tag from published posts. Distinct is enforced by the
  /// Set; small enough to run as a single query without aggregation.
  const posts = await prisma.blogPost.findMany({
    where: { status: 'PUBLISHED' },
    select: { tags: true },
  });
  const set = new Set<string>();
  for (const p of posts) for (const t of p.tags) set.add(t);
  return Array.from(set).sort();
}

// -------- Admin ------------------------------------------------------

export async function adminListPosts(query: AdminListBlogPostsQuery) {
  const where: Prisma.BlogPostWhereInput = {};
  if (query.status !== 'ALL') where.status = query.status;
  if (query.q) {
    where.OR = [
      { title: { contains: query.q, mode: 'insensitive' } },
      { slug: { contains: query.q, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.blogPost.count({ where }),
  ]);

  return {
    items: items.map(serializeAdmin),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function adminGetPost(idOrSlug: string) {
  const post = await prisma.blogPost.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
  });
  if (!post) throw HttpError.notFound('Post not found');
  return serializeAdmin(post);
}

interface AuthorContext {
  authorId?: string | null;
  authorName?: string | null;
}

export async function adminCreatePost(body: UpsertBlogPostBody, ctx: AuthorContext = {}) {
  const slug = body.slug ?? slugify(body.title);
  if (!slug) throw HttpError.badRequest('Could not derive slug from title');
  const exists = await prisma.blogPost.findUnique({ where: { slug }, select: { id: true } });
  if (exists) throw HttpError.conflict(`A post with slug "${slug}" already exists`);

  const status = body.status;
  /// Auto-set publishedAt when transitioning straight to PUBLISHED.
  /// SCHEDULED relies on `publishedAt` from the body.
  const publishedAt =
    status === 'PUBLISHED'
      ? new Date()
      : status === 'SCHEDULED' && body.publishedAt
        ? new Date(body.publishedAt)
        : null;

  const post = await prisma.blogPost.create({
    data: {
      slug,
      title: body.title,
      excerpt: body.excerpt ?? null,
      content: body.content,
      heroImage: body.heroImage ?? null,
      heroImageAlt: body.heroImageAlt ?? null,
      authorId: ctx.authorId ?? null,
      authorName: body.authorName ?? ctx.authorName ?? null,
      status,
      publishedAt,
      metaTitle: body.metaTitle ?? null,
      metaDescription: body.metaDescription ?? null,
      ogImage: body.ogImage ?? null,
      tags: body.tags,
      readingTimeMin: readingTimeMinutes(body.content),
    },
  });
  return serializeAdmin(post);
}

export async function adminUpdatePost(id: string, body: PartialBlogPostBody) {
  const existing = await prisma.blogPost.findUnique({ where: { id } });
  if (!existing) throw HttpError.notFound('Post not found');

  if (body.slug && body.slug !== existing.slug) {
    const clash = await prisma.blogPost.findFirst({
      where: { slug: body.slug, NOT: { id } },
      select: { id: true },
    });
    if (clash) throw HttpError.conflict(`Slug "${body.slug}" is already in use`);
  }

  /// Recompute publishedAt on status transitions:
  ///   - DRAFT/SCHEDULED → PUBLISHED → set to now (unless body provides one)
  ///   - SCHEDULED → keep the future date the admin set
  ///   - PUBLISHED → DRAFT → null out so the post hides
  let publishedAt: Date | null | undefined;
  if (body.status !== undefined && body.status !== existing.status) {
    if (body.status === 'PUBLISHED') {
      publishedAt = body.publishedAt ? new Date(body.publishedAt) : new Date();
    } else if (body.status === 'SCHEDULED') {
      publishedAt = body.publishedAt ? new Date(body.publishedAt) : null;
    } else {
      publishedAt = null;
    }
  } else if (body.publishedAt !== undefined) {
    publishedAt = body.publishedAt ? new Date(body.publishedAt) : null;
  }

  const post = await prisma.blogPost.update({
    where: { id },
    data: {
      ...(body.slug !== undefined && { slug: body.slug }),
      ...(body.title !== undefined && { title: body.title }),
      ...(body.excerpt !== undefined && { excerpt: body.excerpt ?? null }),
      ...(body.content !== undefined && {
        content: body.content,
        readingTimeMin: readingTimeMinutes(body.content),
      }),
      ...(body.heroImage !== undefined && { heroImage: body.heroImage ?? null }),
      ...(body.heroImageAlt !== undefined && { heroImageAlt: body.heroImageAlt ?? null }),
      ...(body.authorName !== undefined && { authorName: body.authorName ?? null }),
      ...(body.status !== undefined && { status: body.status }),
      ...(publishedAt !== undefined && { publishedAt }),
      ...(body.metaTitle !== undefined && { metaTitle: body.metaTitle ?? null }),
      ...(body.metaDescription !== undefined && { metaDescription: body.metaDescription ?? null }),
      ...(body.ogImage !== undefined && { ogImage: body.ogImage ?? null }),
      ...(body.tags !== undefined && { tags: body.tags }),
    },
  });
  return serializeAdmin(post);
}

export async function adminDeletePost(id: string): Promise<void> {
  const exists = await prisma.blogPost.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw HttpError.notFound('Post not found');
  await prisma.blogPost.delete({ where: { id } });
}

/**
 * Cron job hook: any post with status=SCHEDULED whose publishedAt is in
 * the past flips to PUBLISHED. Called from the existing cron scaffold
 * once every minute.
 */
export async function publishScheduledPosts(): Promise<number> {
  const r = await prisma.blogPost.updateMany({
    where: {
      status: 'SCHEDULED',
      publishedAt: { lte: new Date() },
    },
    data: { status: 'PUBLISHED' },
  });
  return r.count;
}
