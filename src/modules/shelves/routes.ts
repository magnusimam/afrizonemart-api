import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { publicReadShelfHandler } from './controller';

export const shelfRoutes = Router();

shelfRoutes.get('/:key', asyncHandler(publicReadShelfHandler));
