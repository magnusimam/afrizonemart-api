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

/// Intern-facing routes mounted at /api/intern/product-submissions.
/// Gated by `products.submit` — distinct from products.image-only so
/// an intern can do product entry without image work (or both).
/// ADMIN passes via effectiveCapabilities().
export const productSubmissionRoutes = Router();

productSubmissionRoutes.use(
  requireAuth,
  requireRole('STAFF', 'ADMIN'),
  requireCapability('products.submit'),
);

productSubmissionRoutes.get('/', asyncHandler(listMySubmissionsHandler));
productSubmissionRoutes.post('/', asyncHandler(createSubmissionHandler));
productSubmissionRoutes.get('/:id', asyncHandler(getMySubmissionHandler));
productSubmissionRoutes.patch('/:id', asyncHandler(updateSubmissionHandler));
