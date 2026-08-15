import { Router } from 'express';
import { optionalAuth } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/async-handler';
import { similarHandler, trackClickHandler, trendingHandler } from './controller';

export const recommendationsRoutes = Router();

// Public — anyone gets recommendations. optionalAuth attributes the
// impression log to a signed-in user without requiring a token, same
// convention as `modules/search/routes.ts`.
recommendationsRoutes.get('/similar', optionalAuth, asyncHandler(similarHandler));
recommendationsRoutes.get('/trending', optionalAuth, asyncHandler(trendingHandler));
recommendationsRoutes.post('/click', asyncHandler(trackClickHandler));
