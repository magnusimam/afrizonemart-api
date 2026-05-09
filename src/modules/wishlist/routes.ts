import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireAuth } from '@/middleware/auth';
import {
  addWishlistHandler,
  countWishlistHandler,
  listWishlistHandler,
  removeWishlistHandler,
} from './controller';

/**
 * Wishlist routes — all gated behind requireAuth, scoped per-user
 * inside the service. POST is idempotent (same productId twice is a
 * no-op), DELETE is by productId so the heart-toggle on cards/PDP
 * can act without knowing the WishlistItem id.
 */
export const wishlistRoutes = Router();

wishlistRoutes.use(requireAuth);

wishlistRoutes.get('/', asyncHandler(listWishlistHandler));
wishlistRoutes.get('/count', asyncHandler(countWishlistHandler));
wishlistRoutes.post('/', asyncHandler(addWishlistHandler));
wishlistRoutes.delete('/:productId', asyncHandler(removeWishlistHandler));
