import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminGetSubmissionHandler,
  adminListSubmissionsHandler,
  adminReviewSubmissionHandler,
} from './controller';

/// Reviewer endpoints mounted at /api/admin/document-submissions.
/// The parent admin router gates this with
/// requireCapability('intern.review') — same capability that gates
/// image + full-product submission review, so one "Approve / reject
/// intern submissions" grant covers all three surfaces. Self-review
/// is blocked in the service layer.
export const adminDocumentSubmissionRoutes = Router();

adminDocumentSubmissionRoutes.get('/', asyncHandler(adminListSubmissionsHandler));
adminDocumentSubmissionRoutes.get('/:id', asyncHandler(adminGetSubmissionHandler));
adminDocumentSubmissionRoutes.post('/:id/review', asyncHandler(adminReviewSubmissionHandler));
