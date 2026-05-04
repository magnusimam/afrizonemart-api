import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { getPostHandler, listPostsHandler, listTagsHandler } from './controller';

export const blogRoutes = Router();

blogRoutes.get('/', asyncHandler(listPostsHandler));
blogRoutes.get('/tags', asyncHandler(listTagsHandler));
blogRoutes.get('/:slug', asyncHandler(getPostHandler));
