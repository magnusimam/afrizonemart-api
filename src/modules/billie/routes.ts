import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '@/middleware/async-handler';
import { requireServiceToken } from '@/middleware/service-token';
import { getOverview, getSupplier, listProducts, listSuppliers } from './service';

/**
 * `/api/billie` — the read-only surface the B.I.L.L.I.E. voice assistant
 * calls on the operator's behalf.
 *
 * Deliberately narrow: four GETs that answer "how is the supplier network
 * doing", "who is X", and "what needs me". No mutations exist on this
 * router at all, and the token that reaches it is read-only besides — so
 * there is no path from a misheard voice command to a changed record.
 *
 * Everything here returns in well under a second, so there is no job/poll
 * flow: a live call never waits on us.
 */
export const billieRoutes = Router();

billieRoutes.use(requireServiceToken('suppliers.read'));

/** Clamp caller-supplied limits so one call can't drag the whole table. */
function parseLimit(raw: unknown, fallback = 25): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), 100);
}

billieRoutes.get(
  '/overview',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(await getOverview());
  }),
);

billieRoutes.get(
  '/suppliers',
  asyncHandler(async (req: Request, res: Response) => {
    const stageRaw = req.query.stage;
    const stage = stageRaw === undefined ? undefined : Number(stageRaw);
    res.json(
      await listSuppliers({
        query: typeof req.query.query === 'string' ? req.query.query : undefined,
        stage: Number.isInteger(stage) ? stage : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        limit: parseLimit(req.query.limit),
      }),
    );
  }),
);

billieRoutes.get(
  '/suppliers/:id',
  asyncHandler(async (req: Request, res: Response) => {
    res.json(await getSupplier(req.params.id));
  }),
);

billieRoutes.get(
  '/products',
  asyncHandler(async (req: Request, res: Response) => {
    res.json(
      await listProducts({
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        limit: parseLimit(req.query.limit),
      }),
    );
  }),
);
