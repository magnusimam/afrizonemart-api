import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminGetSettingsHandler,
  adminUpdateSettingsHandler,
} from './admin.controller';

export const adminSettingsRoutes = Router();

adminSettingsRoutes.get('/', asyncHandler(adminGetSettingsHandler));
adminSettingsRoutes.put('/', asyncHandler(adminUpdateSettingsHandler));
