import type { Request, Response } from 'express';
import { z } from 'zod';
import { adminListAudit } from './service';

const listQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  actorUserId: z.string().optional(),
  entityType: z.string().optional(),
  action: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function adminListAuditHandler(req: Request, res: Response): Promise<void> {
  const q = listQuery.parse(req.query);
  res.json(
    await adminListAudit({
      page: q.page,
      limit: q.limit,
      actorUserId: q.actorUserId,
      entityType: q.entityType,
      action: q.action,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
    }),
  );
}
