import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '@/middleware/async-handler';
import { optionalAuth, type AuthedRequest } from '@/middleware/auth';
import { evaluateFlags } from './service';

export const featureFlagRoutes = Router();

const querySchema = z.object({
  keys: z.string().min(1),
  country: z.string().length(2).optional(),
});

/**
 * Public batch read. Frontend calls
 * `GET /api/flags?keys=new_checkout,beta_search` once at app boot and
 * caches. Auth is optional — anon users still get default values.
 */
featureFlagRoutes.get(
  '/',
  optionalAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const q = querySchema.parse(req.query);
    const keys = q.keys
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const user = (req as AuthedRequest).user;
    const flags = await evaluateFlags(keys, {
      userId: user?.id,
      userRole: user?.role,
      country: q.country,
    });
    res.json({ flags });
  }),
);
