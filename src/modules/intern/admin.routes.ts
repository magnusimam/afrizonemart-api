import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireCapability } from '@/middleware/require-capability';
import {
  adminBulkAssignHandler,
  adminExportCsvHandler,
  adminGetPayRateHandler,
  adminGetProgressHandler,
  adminListSubmissionsHandler,
  adminReassignHandler,
  adminReviewSubmissionHandler,
  adminSetPayRateHandler,
} from './controller';

/// Admin endpoints for the intern image-update workflow. Mounted
/// under /api/admin/intern. Gated on `intern.review` — distinct from
/// the intern's own `products.image-only` so an operations
/// teammate can be granted approval rights without touching the
/// intern's upload surface. ADMIN's firehose grants it for free.
/// Self-review is blocked at the service layer (interns granted
/// `products.image-only` will never also hold `intern.review`, but
/// we still defend in depth).
export const adminInternRoutes = Router();

adminInternRoutes.use(requireCapability('intern.review'));

adminInternRoutes.get('/progress', asyncHandler(adminGetProgressHandler));
adminInternRoutes.post('/bulk-assign', asyncHandler(adminBulkAssignHandler));
adminInternRoutes.post('/reassign', asyncHandler(adminReassignHandler));
adminInternRoutes.get('/submissions', asyncHandler(adminListSubmissionsHandler));
adminInternRoutes.post(
  '/submissions/:id/review',
  asyncHandler(adminReviewSubmissionHandler),
);

adminInternRoutes.get('/pay-rate', asyncHandler(adminGetPayRateHandler));
adminInternRoutes.put('/pay-rate', asyncHandler(adminSetPayRateHandler));

adminInternRoutes.get('/export.csv', asyncHandler(adminExportCsvHandler));
