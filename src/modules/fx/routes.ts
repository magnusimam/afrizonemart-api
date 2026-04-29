import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { getRates } from './service';

export const fxRoutes = Router();

fxRoutes.get(
  '/rates',
  asyncHandler(async (_req: Request, res: Response) => {
    const snap = await getRates();
    res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.json(snap);
  }),
);
