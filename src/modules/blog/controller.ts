import type { Request, Response } from 'express';
import { HttpError } from '@/middleware/error-handler';
import {
  adminListBlogPostsQuerySchema,
  listBlogPostsQuerySchema,
  partialBlogPostBodySchema,
  upsertBlogPostBodySchema,
} from './schema';
import {
  adminCreatePost,
  adminDeletePost,
  adminGetPost,
  adminListPosts,
  adminUpdatePost,
  getPublishedPost,
  listAllTags,
  listPublishedPosts,
} from './service';

// ---- Public ---------------------------------------------------------

export async function listPostsHandler(req: Request, res: Response): Promise<void> {
  const query = listBlogPostsQuerySchema.parse(req.query);
  const result = await listPublishedPosts(query);
  res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
  res.json(result);
}

export async function getPostHandler(req: Request, res: Response): Promise<void> {
  const slug = req.params.slug;
  if (!slug) throw HttpError.badRequest('Missing post slug');
  const post = await getPublishedPost(slug);
  if (!post) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Post not found' } });
    return;
  }
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  res.json(post);
}

export async function listTagsHandler(_req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'public, max-age=600, stale-while-revalidate=3600');
  res.json({ items: await listAllTags() });
}

// ---- Admin ----------------------------------------------------------

export async function adminListPostsHandler(req: Request, res: Response): Promise<void> {
  const query = adminListBlogPostsQuerySchema.parse(req.query);
  res.json(await adminListPosts(query));
}

export async function adminGetPostHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing post id');
  res.json(await adminGetPost(id));
}

export async function adminCreatePostHandler(req: Request, res: Response): Promise<void> {
  const body = upsertBlogPostBodySchema.parse(req.body);
  const user = (req as Request & { user?: { id: string; name?: string | null; email: string } })
    .user;
  res
    .status(201)
    .json(
      await adminCreatePost(body, {
        authorId: user?.id ?? null,
        authorName: user?.name ?? user?.email ?? null,
      }),
    );
}

export async function adminUpdatePostHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing post id');
  const body = partialBlogPostBodySchema.parse(req.body);
  res.json(await adminUpdatePost(id, body));
}

export async function adminDeletePostHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing post id');
  await adminDeletePost(id);
  res.status(204).end();
}
