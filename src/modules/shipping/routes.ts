import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { publicGetRatesHandler } from './controller';

export const shippingRoutes = Router();

// Public — checkout needs to query rates before login (well, today
// checkout requires auth, but the endpoint itself is safe to be public).
shippingRoutes.get('/rates', asyncHandler(publicGetRatesHandler));
