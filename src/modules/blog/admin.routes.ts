import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import {
  adminCreatePostHandler,
  adminDeletePostHandler,
  adminGetPostHandler,
  adminListPostsHandler,
  adminUpdatePostHandler,
} from './controller';

export const adminBlogRoutes = Router();

adminBlogRoutes.get('/', asyncHandler(adminListPostsHandler));
adminBlogRoutes.post('/', asyncHandler(adminCreatePostHandler));
adminBlogRoutes.get('/:id', asyncHandler(adminGetPostHandler));
adminBlogRoutes.patch('/:id', asyncHandler(adminUpdatePostHandler));
adminBlogRoutes.delete('/:id', asyncHandler(adminDeletePostHandler));
