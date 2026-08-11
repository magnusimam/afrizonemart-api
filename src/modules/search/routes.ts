import { Router } from 'express';
import { optionalAuth } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/async-handler';
import { autocompleteHandler, searchHandler, trackClickHandler } from './controller';

export const searchRoutes = Router();

// Public — anyone can search. optionalAuth attributes the query log to a
// signed-in user without requiring a token.
searchRoutes.get('/', optionalAuth, asyncHandler(searchHandler));
searchRoutes.get('/autocomplete', asyncHandler(autocompleteHandler));
searchRoutes.post('/click', asyncHandler(trackClickHandler));
