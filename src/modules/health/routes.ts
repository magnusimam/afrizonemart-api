import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { getHealth } from './controller';

export const healthRoutes = Router();

healthRoutes.get('/', asyncHandler(getHealth));
