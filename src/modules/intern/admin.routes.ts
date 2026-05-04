import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireRole } from '@/middleware/require-role';
import {
  adminBulkAssignHandler,
  adminGetProgressHandler,
  adminListSubmissionsHandler,
  adminReassignHandler,
  adminReviewSubmissionHandler,
} from './controller';

/// Admin endpoints for the intern image-update workflow. Mounted
/// under /api/admin/intern. ADMIN-only — even a STAFF account with
/// products.image-only must not be able to reassign work or approve
/// their own submissions.
export const adminInternRoutes = Router();

adminInternRoutes.use(requireRole('ADMIN'));

adminInternRoutes.get('/progress', asyncHandler(adminGetProgressHandler));
adminInternRoutes.post('/bulk-assign', asyncHandler(adminBulkAssignHandler));
adminInternRoutes.post('/reassign', asyncHandler(adminReassignHandler));
adminInternRoutes.get('/submissions', asyncHandler(adminListSubmissionsHandler));
adminInternRoutes.post(
  '/submissions/:id/review',
  asyncHandler(adminReviewSubmissionHandler),
);
