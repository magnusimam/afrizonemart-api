import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  createGatewayConfigHandler,
  deleteGatewayConfigHandler,
  getGatewayConfigHandler,
  listAvailableProvidersHandler,
  listGatewayConfigsHandler,
  updateGatewayConfigHandler,
} from './admin.controller';

export const adminPaymentRoutes = Router();

// Provider catalogue — what kinds of gateways the platform supports
// out of the box. Adding a new one is a code change (drop a file in
// payments/ + register in registry.ts).
adminPaymentRoutes.get('/providers', listAvailableProvidersHandler);

// Configured instances — admin CRUD.
adminPaymentRoutes.get('/', asyncHandler(listGatewayConfigsHandler));
adminPaymentRoutes.get('/:id', asyncHandler(getGatewayConfigHandler));
adminPaymentRoutes.post('/', asyncHandler(createGatewayConfigHandler));
adminPaymentRoutes.patch('/:id', asyncHandler(updateGatewayConfigHandler));
adminPaymentRoutes.delete('/:id', asyncHandler(deleteGatewayConfigHandler));
