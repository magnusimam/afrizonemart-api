import { z } from 'zod';

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug uses lowercase letters, digits, and hyphens');

export const upsertBlogPostBodySchema = z.object({
  /// Optional — auto-derived from title when blank, same convention as
  /// the products bulk import.
  slug: slugSchema.optional(),
  title: z.string().trim().min(1).max(200),
  excerpt: z.string().trim().max(500).nullish(),
  content: z.string().min(1, 'Post content is required'),
  heroImage: z.string().url().nullish(),
  heroImageAlt: z.string().trim().max(200).nullish(),
  authorName: z.string().trim().max(120).nullish(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'SCHEDULED']).default('DRAFT'),
  /// For SCHEDULED posts: when the cron should flip to PUBLISHED.
  /// For PUBLISHED posts: ignored on update (set automatically).
  publishedAt: z.string().datetime().nullish(),
  metaTitle: z.string().trim().max(160).nullish(),
  metaDescription: z.string().trim().max(320).nullish(),
  ogImage: z.string().url().nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).default([]),
});
export type UpsertBlogPostBody = z.infer<typeof upsertBlogPostBodySchema>;

export const partialBlogPostBodySchema = upsertBlogPostBodySchema.partial();
export type PartialBlogPostBody = z.infer<typeof partialBlogPostBodySchema>;

export const listBlogPostsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  tag: z.string().trim().min(1).max(40).optional(),
  q: z.string().trim().min(1).max(160).optional(),
});
export type ListBlogPostsQuery = z.infer<typeof listBlogPostsQuerySchema>;

export const adminListBlogPostsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(['DRAFT', 'PUBLISHED', 'SCHEDULED', 'ALL']).default('ALL'),
  q: z.string().trim().min(1).max(160).optional(),
});
export type AdminListBlogPostsQuery = z.infer<typeof adminListBlogPostsQuerySchema>;
