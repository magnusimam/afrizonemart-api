import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  completeVisitHandler,
  confirmVisitHandler,
  listVisitsHandler,
} from './admin.visit.controller';

/** Facility-visit team — mounted at /api/admin/facility-visits, gated by
 *  requireCapability('suppliers.visits'). */
export const adminFacilityVisitRoutes = Router();

adminFacilityVisitRoutes.get('/', asyncHandler(listVisitsHandler));
adminFacilityVisitRoutes.post('/:id/confirm', asyncHandler(confirmVisitHandler));
adminFacilityVisitRoutes.post('/:id/complete', asyncHandler(completeVisitHandler));
