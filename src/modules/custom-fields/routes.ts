import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { customFieldScopeEnum } from './schema';
import { getActiveFields } from './service';

export const customFieldRoutes = Router();

/**
 * Public read of active field defs for a scope. Storefront uses this so
 * it knows how to render `product.attributes` correctly. No secrets in
 * the def shape, so no auth required.
 */
customFieldRoutes.get(
  '/:scope',
  asyncHandler(async (req: Request, res: Response) => {
    const scope = customFieldScopeEnum.parse(req.params.scope.toUpperCase());
    res.json({ items: await getActiveFields(scope) });
  }),
);
