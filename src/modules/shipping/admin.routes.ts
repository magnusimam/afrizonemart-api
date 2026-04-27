import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminCreateRateHandler,
  adminCreateZoneHandler,
  adminDeleteRateHandler,
  adminDeleteZoneHandler,
  adminListRatesHandler,
  adminListZonesHandler,
  adminUpdateRateHandler,
  adminUpdateZoneHandler,
} from './admin.controller';

export const adminShippingRoutes = Router();

adminShippingRoutes.get('/zones', asyncHandler(adminListZonesHandler));
adminShippingRoutes.post('/zones', asyncHandler(adminCreateZoneHandler));
adminShippingRoutes.patch('/zones/:id', asyncHandler(adminUpdateZoneHandler));
adminShippingRoutes.delete('/zones/:id', asyncHandler(adminDeleteZoneHandler));

adminShippingRoutes.get('/zones/:id/rates', asyncHandler(adminListRatesHandler));
adminShippingRoutes.post('/zones/:id/rates', asyncHandler(adminCreateRateHandler));
adminShippingRoutes.patch('/rates/:rateId', asyncHandler(adminUpdateRateHandler));
adminShippingRoutes.delete('/rates/:rateId', asyncHandler(adminDeleteRateHandler));
