import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { getContentHandler } from './controller';

export const contentRoutes = Router();

contentRoutes.get('/', asyncHandler(getContentHandler));
