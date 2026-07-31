import type { Request, Response } from 'express';
import { HttpError } from '@/middleware/error-handler';
import {
  adminListDocumentsQuerySchema,
  listDocumentsQuerySchema,
  partialDocumentBodySchema,
  upsertDocumentBodySchema,
} from './schema';
import {
  adminCreateDocument,
  adminDeleteDocument,
  adminGetDocument,
  adminListDocuments,
  adminUpdateDocument,
  getPublishedDocument,
  listPublishedDocuments,
  trackDocumentDownload,
} from './service';

// ---- Public ---------------------------------------------------------

export async function listDocumentsHandler(req: Request, res: Response): Promise<void> {
  const query = listDocumentsQuerySchema.parse(req.query);
  const result = await listPublishedDocuments(query);
  res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
  res.json(result);
}

export async function getDocumentHandler(req: Request, res: Response): Promise<void> {
  const slug = req.params.slug;
  if (!slug) throw HttpError.badRequest('Missing document slug');
  const doc = await getPublishedDocument(slug);
  if (!doc) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
    return;
  }
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  res.json(doc);
}

export async function trackDownloadHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing document id');
  await trackDocumentDownload(id);
  res.status(204).end();
}

// ---- Admin ----------------------------------------------------------

export async function adminListDocumentsHandler(req: Request, res: Response): Promise<void> {
  const query = adminListDocumentsQuerySchema.parse(req.query);
  res.json(await adminListDocuments(query));
}

export async function adminGetDocumentHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing document id');
  res.json(await adminGetDocument(id));
}

export async function adminCreateDocumentHandler(req: Request, res: Response): Promise<void> {
  const body = upsertDocumentBodySchema.parse(req.body);
  res.status(201).json(await adminCreateDocument(body));
}

export async function adminUpdateDocumentHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing document id');
  const body = partialDocumentBodySchema.parse(req.body);
  res.json(await adminUpdateDocument(id, body));
}

export async function adminDeleteDocumentHandler(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing document id');
  await adminDeleteDocument(id);
  res.status(204).end();
}
