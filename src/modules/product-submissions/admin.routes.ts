import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminGetSubmissionHandler,
  adminListSubmissionsHandler,
  adminReviewSubmissionHandler,
} from './controller';

/// Reviewer endpoints mounted at /api/admin/product-submissions.
/// The parent admin router gates this with
/// requireCapability('intern.review') — the same capability that
/// gates image-submission review, so one "Approve / reject intern
/// submissions" grant covers both surfaces. Self-review is blocked
/// in the service layer.
export const adminProductSubmissionRoutes = Router();

adminProductSubmissionRoutes.get('/', asyncHandler(adminListSubmissionsHandler));
adminProductSubmissionRoutes.get('/:id', asyncHandler(adminGetSubmissionHandler));
adminProductSubmissionRoutes.post('/:id/review', asyncHandler(adminReviewSubmissionHandler));
