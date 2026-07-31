import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminCreateDocumentHandler,
  adminDeleteDocumentHandler,
  adminGetDocumentHandler,
  adminListDocumentsHandler,
  adminUpdateDocumentHandler,
} from './controller';

/// Mounted at /api/admin/documents. The parent admin router gates
/// this with requireCapability('documents.write').
export const adminDocumentRoutes = Router();

adminDocumentRoutes.get('/', asyncHandler(adminListDocumentsHandler));
adminDocumentRoutes.post('/', asyncHandler(adminCreateDocumentHandler));
adminDocumentRoutes.get('/:id', asyncHandler(adminGetDocumentHandler));
adminDocumentRoutes.patch('/:id', asyncHandler(adminUpdateDocumentHandler));
adminDocumentRoutes.delete('/:id', asyncHandler(adminDeleteDocumentHandler));
