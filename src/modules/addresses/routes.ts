import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireAuth } from '@/middleware/auth';
import {
  createAddressHandler,
  deleteAddressHandler,
  listAddressesHandler,
  updateAddressHandler,
} from './controller';

/**
 * Customer-facing saved addresses. All routes require authentication;
 * each handler additionally scopes by `req.user.id` so a signed-in
 * customer can only see / edit / delete their own rows.
 *
 * No rate-limit middleware — requireAuth + per-row ownership checks
 * are enough; address mutations are infrequent for legitimate users
 * and the spam-protection trade-off would hurt UX without meaningful
 * gain.
 */
export const addressRoutes = Router();

addressRoutes.use(requireAuth);

addressRoutes.get('/', asyncHandler(listAddressesHandler));
addressRoutes.post('/', asyncHandler(createAddressHandler));
addressRoutes.patch('/:id', asyncHandler(updateAddressHandler));
addressRoutes.delete('/:id', asyncHandler(deleteAddressHandler));
