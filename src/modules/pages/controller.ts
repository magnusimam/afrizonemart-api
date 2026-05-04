import type { Request, Response } from 'express';
import { HttpError } from '@/middleware/error-handler';
import {
  partialPageBodySchema,
  partialSectionBodySchema,
  publishPageBodySchema,
  reorderSectionsBodySchema,
  revertToRevisionBodySchema,
  upsertPageBodySchema,
  upsertSectionBodySchema,
} from './schema';
import {
  adminCreatePage,
  adminCreateSection,
  adminDeletePage,
  adminDeleteSection,
  adminGetPage,
  adminListPages,
  adminListRevisions,
  adminPublishPage,
  adminReorderSections,
  adminRevertToRevision,
  adminUpdatePage,
  adminUpdateSection,
  getPublishedPage,
} from './service';

// ---- Public ---------------------------------------------------------

export async function getPublishedPageHandler(req: Request, res: Response): Promise<void> {
  // Slugs are URL-encoded ("shop%2Fgroceries"), Express decodes them
  // before this handler runs. Reject leading/trailing slashes here.
  const slug = String(req.params.slug ?? '').replace(/^\/+|\/+$/g, '');
  if (!slug) throw HttpError.badRequest('Missing page slug');

  // The geo middleware sets req.cookies['azm_country'] = ISO-2 (NG/KE).
  // Sections without country targeting render globally; targeted ones
  // require a match.
  const country = (req.cookies?.['azm_country'] as string | undefined) ?? null;

  const page = await getPublishedPage(slug, country);
  if (!page) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Page not found' } });
    return;
  }
  // Edge cache: 60s cached + SWR for 10 min — long enough to absorb
  // bursts, short enough that a Publish lands within a minute.
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
  res.json(page);
}

// ---- Admin: pages ---------------------------------------------------

export async function adminListPagesHandler(_req: Request, res: Response): Promise<void> {
  res.json(await adminListPages());
}

export async function adminGetPageHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing page id');
  res.json(await adminGetPage(id));
}

export async function adminCreatePageHandler(req: Request, res: Response): Promise<void> {
  const body = upsertPageBodySchema.parse(req.body);
  res.status(201).json(await adminCreatePage(body));
}

export async function adminUpdatePageHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing page id');
  const body = partialPageBodySchema.parse(req.body);
  res.json(await adminUpdatePage(id, body));
}

export async function adminDeletePageHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing page id');
  await adminDeletePage(id);
  res.status(204).end();
}

// ---- Admin: sections -------------------------------------------------

export async function adminCreateSectionHandler(req: Request, res: Response): Promise<void> {
  const pageId = req.params.id;
  if (!pageId) throw HttpError.badRequest('Missing page id');
  const body = upsertSectionBodySchema.parse(req.body);
  res.status(201).json(await adminCreateSection(pageId, body));
}

export async function adminUpdateSectionHandler(req: Request, res: Response): Promise<void> {
  const sectionId = req.params.sectionId;
  if (!sectionId) throw HttpError.badRequest('Missing section id');
  const body = partialSectionBodySchema.parse(req.body);
  res.json(await adminUpdateSection(sectionId, body));
}

export async function adminDeleteSectionHandler(req: Request, res: Response): Promise<void> {
  const sectionId = req.params.sectionId;
  if (!sectionId) throw HttpError.badRequest('Missing section id');
  await adminDeleteSection(sectionId);
  res.status(204).end();
}

export async function adminReorderSectionsHandler(req: Request, res: Response): Promise<void> {
  const pageId = req.params.id;
  if (!pageId) throw HttpError.badRequest('Missing page id');
  const body = reorderSectionsBodySchema.parse(req.body);
  res.json(await adminReorderSections(pageId, body));
}

// ---- Admin: publish + revisions -------------------------------------

export async function adminPublishPageHandler(req: Request, res: Response): Promise<void> {
  const pageId = req.params.id;
  if (!pageId) throw HttpError.badRequest('Missing page id');
  const body = publishPageBodySchema.parse(req.body);
  // The auth middleware decorates req with the authed user; capture
  // their identity so the revision row records who clicked Publish.
  const user = (req as Request & { user?: { id: string; email: string } }).user;
  res.json(
    await adminPublishPage(pageId, body, {
      authorId: user?.id ?? null,
      authorEmail: user?.email ?? null,
    }),
  );
}

export async function adminListRevisionsHandler(req: Request, res: Response): Promise<void> {
  const pageId = req.params.id;
  if (!pageId) throw HttpError.badRequest('Missing page id');
  res.json(await adminListRevisions(pageId));
}

export async function adminRevertToRevisionHandler(req: Request, res: Response): Promise<void> {
  const pageId = req.params.id;
  if (!pageId) throw HttpError.badRequest('Missing page id');
  const body = revertToRevisionBodySchema.parse(req.body);
  const user = (req as Request & { user?: { id: string; email: string } }).user;
  res.json(
    await adminRevertToRevision(pageId, body, {
      authorId: user?.id ?? null,
      authorEmail: user?.email ?? null,
    }),
  );
}
