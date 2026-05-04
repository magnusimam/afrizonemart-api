import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireAuth } from '@/middleware/auth';
import { requireRole } from '@/middleware/require-role';
import { requireCapability } from '@/middleware/require-capability';
import {
  claimFromPoolHandler,
  getMyQueueHandler,
  submitImagesHandler,
} from './controller';

/// Intern-facing routes mounted at /api/intern. Gated by the
/// products.image-only capability — STAFF accounts the admin
/// explicitly granted (see /admin/staff). ADMIN passes too because
/// effectiveCapabilities() resolves ADMIN to the full set.
export const internRoutes = Router();

internRoutes.use(requireAuth, requireRole('STAFF', 'ADMIN'), requireCapability('products.image-only'));

internRoutes.get('/queue', asyncHandler(getMyQueueHandler));
internRoutes.post('/claim', asyncHandler(claimFromPoolHandler));
internRoutes.post('/products/:id/submit', asyncHandler(submitImagesHandler));
