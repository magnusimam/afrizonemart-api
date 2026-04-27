import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminCreateWebhookHandler,
  adminDeleteWebhookHandler,
  adminGetWebhookHandler,
  adminListDeliveriesHandler,
  adminListWebhooksHandler,
  adminReplayDeliveryHandler,
  adminRotateSecretHandler,
  adminUpdateWebhookHandler,
} from './admin.controller';

export const adminWebhookRoutes = Router();

adminWebhookRoutes.get('/', asyncHandler(adminListWebhooksHandler));
adminWebhookRoutes.post('/', asyncHandler(adminCreateWebhookHandler));
adminWebhookRoutes.get('/:id', asyncHandler(adminGetWebhookHandler));
adminWebhookRoutes.patch('/:id', asyncHandler(adminUpdateWebhookHandler));
adminWebhookRoutes.delete('/:id', asyncHandler(adminDeleteWebhookHandler));
adminWebhookRoutes.get('/:id/deliveries', asyncHandler(adminListDeliveriesHandler));
adminWebhookRoutes.post(
  '/:id/deliveries/:deliveryId/replay',
  asyncHandler(adminReplayDeliveryHandler),
);
adminWebhookRoutes.post('/:id/rotate-secret', asyncHandler(adminRotateSecretHandler));
