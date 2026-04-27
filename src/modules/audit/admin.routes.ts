import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { adminListAuditHandler } from './admin.controller';

export const adminAuditRoutes = Router();

adminAuditRoutes.get('/', asyncHandler(adminListAuditHandler));
