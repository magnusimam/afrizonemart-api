import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminCreatePageHandler,
  adminCreateSectionHandler,
  adminDeletePageHandler,
  adminDeleteSectionHandler,
  adminGetPageHandler,
  adminListPagesHandler,
  adminListRevisionsHandler,
  adminPublishPageHandler,
  adminReorderSectionsHandler,
  adminRevertToRevisionHandler,
  adminUpdatePageHandler,
  adminUpdateSectionHandler,
} from './controller';

export const adminPageRoutes = Router();

// Pages
adminPageRoutes.get('/', asyncHandler(adminListPagesHandler));
adminPageRoutes.post('/', asyncHandler(adminCreatePageHandler));
adminPageRoutes.get('/:id', asyncHandler(adminGetPageHandler));
adminPageRoutes.patch('/:id', asyncHandler(adminUpdatePageHandler));
adminPageRoutes.delete('/:id', asyncHandler(adminDeletePageHandler));

// Sections (nested under page id)
adminPageRoutes.post('/:id/sections', asyncHandler(adminCreateSectionHandler));
adminPageRoutes.patch('/:id/sections/reorder', asyncHandler(adminReorderSectionsHandler));
adminPageRoutes.patch('/:id/sections/:sectionId', asyncHandler(adminUpdateSectionHandler));
adminPageRoutes.delete('/:id/sections/:sectionId', asyncHandler(adminDeleteSectionHandler));

// Publish + revisions
adminPageRoutes.post('/:id/publish', asyncHandler(adminPublishPageHandler));
adminPageRoutes.get('/:id/revisions', asyncHandler(adminListRevisionsHandler));
adminPageRoutes.post('/:id/revert', asyncHandler(adminRevertToRevisionHandler));
