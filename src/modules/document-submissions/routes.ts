import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireAuth } from '@/middleware/auth';
import { requireRole } from '@/middleware/require-role';
import { requireCapability } from '@/middleware/require-capability';
import {
  createSubmissionHandler,
  getMySubmissionHandler,
  listMySubmissionsHandler,
  updateSubmissionHandler,
} from './controller';

/// Intern-facing routes mounted at /api/intern/document-submissions.
/// Gated by `documents.submit`. ADMIN passes via effectiveCapabilities().
export const documentSubmissionRoutes = Router();

documentSubmissionRoutes.use(
  requireAuth,
  requireRole('STAFF', 'ADMIN'),
  requireCapability('documents.submit'),
);

documentSubmissionRoutes.get('/', asyncHandler(listMySubmissionsHandler));
documentSubmissionRoutes.post('/', asyncHandler(createSubmissionHandler));
documentSubmissionRoutes.get('/:id', asyncHandler(getMySubmissionHandler));
documentSubmissionRoutes.patch('/:id', asyncHandler(updateSubmissionHandler));
