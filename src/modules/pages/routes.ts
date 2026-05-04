import { Router } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { getPublishedPageHandler } from './controller';

export const pageRoutes = Router();

/**
 * Public storefront — fetch the live section list for a slug.
 * Slugs may contain slashes ("shop/groceries"); the splat captures
 * everything after /api/pages/.
 */
pageRoutes.get('/:slug(*)', asyncHandler(getPublishedPageHandler));
