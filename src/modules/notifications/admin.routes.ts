import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminGetNotificationHandler,
  adminListNotificationsHandler,
  adminResendNotificationHandler,
} from './admin.controller';

export const adminNotificationRoutes = Router();

adminNotificationRoutes.get('/', asyncHandler(adminListNotificationsHandler));
adminNotificationRoutes.get('/:id', asyncHandler(adminGetNotificationHandler));
adminNotificationRoutes.post('/:id/resend', asyncHandler(adminResendNotificationHandler));
