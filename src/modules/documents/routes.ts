import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { getDocumentHandler, listDocumentsHandler, trackDownloadHandler } from './controller';

export const documentRoutes = Router();

documentRoutes.get('/', asyncHandler(listDocumentsHandler));
documentRoutes.get('/:slug', asyncHandler(getDocumentHandler));
// Keyed by id (not slug) since the frontend already has the id from
// the list/detail payload — avoids a slug lookup on the hot path of
// "user clicked Download". No auth: Civic Library downloads are
// anonymous by design.
documentRoutes.post('/:id/track-download', asyncHandler(trackDownloadHandler));
