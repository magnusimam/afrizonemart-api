import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { listPublicMethodsHandler } from './controller';

/// Tracker #46 — public read for the checkout payment page.
export const paymentMethodRoutes = Router();
paymentMethodRoutes.get('/', asyncHandler(listPublicMethodsHandler));
