import { Router } from 'express';
import { optionalAuth } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/async-handler';
import {
  alsoBoughtHandler,
  frequentlyBoughtTogetherHandler,
  similarHandler,
  trackClickHandler,
  trendingHandler,
  viewedAlsoViewedHandler,
} from './controller';

export const recommendationsRoutes = Router();

// Public — anyone gets recommendations. optionalAuth attributes the
// impression log to a signed-in user without requiring a token, same
// convention as `modules/search/routes.ts`.
recommendationsRoutes.get('/similar', optionalAuth, asyncHandler(similarHandler));
recommendationsRoutes.get('/trending', optionalAuth, asyncHandler(trendingHandler));
recommendationsRoutes.get('/also-bought', optionalAuth, asyncHandler(alsoBoughtHandler));
recommendationsRoutes.get(
  '/frequently-bought-together',
  optionalAuth,
  asyncHandler(frequentlyBoughtTogetherHandler),
);
recommendationsRoutes.get('/viewed-also-viewed', optionalAuth, asyncHandler(viewedAlsoViewedHandler));
recommendationsRoutes.post('/click', asyncHandler(trackClickHandler));
