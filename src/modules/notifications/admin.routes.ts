import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminGetNotificationHandler,
  adminListNotificationsHandler,
  adminResendNotificationHandler,
} from './admin.controller';
import {
  deleteTemplateHandler,
  getTemplateHandler,
  listBlockPaletteHandler,
  listTemplatesHandler,
  previewTemplateHandler,
  sendTestEmailHandler,
  upsertTemplateHandler,
} from './admin.email-templates.controller';

export const adminNotificationRoutes = Router();

// Notification log
adminNotificationRoutes.get('/', asyncHandler(adminListNotificationsHandler));
adminNotificationRoutes.get('/:id', asyncHandler(adminGetNotificationHandler));
adminNotificationRoutes.post('/:id/resend', asyncHandler(adminResendNotificationHandler));

// Email template editor (Phase 10.3)
export const adminEmailTemplateRoutes = Router();

adminEmailTemplateRoutes.get('/blocks', listBlockPaletteHandler);
adminEmailTemplateRoutes.get('/', asyncHandler(listTemplatesHandler));
adminEmailTemplateRoutes.get('/:id', asyncHandler(getTemplateHandler));
adminEmailTemplateRoutes.put('/', asyncHandler(upsertTemplateHandler));
adminEmailTemplateRoutes.delete('/:id', asyncHandler(deleteTemplateHandler));
adminEmailTemplateRoutes.post('/preview', asyncHandler(previewTemplateHandler));
adminEmailTemplateRoutes.post('/send-test', asyncHandler(sendTestEmailHandler));
