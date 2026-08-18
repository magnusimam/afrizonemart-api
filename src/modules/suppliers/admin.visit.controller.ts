import type { Response } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '@/middleware/auth';
import { completeVisit, confirmVisit, getVisitForm, listVisits, saveVisitForm } from './admin.visit.service';

const idParam = z.object({ id: z.string().min(1) });
const confirmBody = z.object({
  confirmedDate: z.string().trim().min(1),
  confirmedWindow: z.string().trim().max(120).optional(),
  leadName: z.string().trim().min(1).max(120),
  leadPhone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function listVisitsHandler(req: AuthedRequest, res: Response): Promise<void> {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  res.json({ items: await listVisits(status) });
}

export async function confirmVisitHandler(req: AuthedRequest, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  const body = confirmBody.parse(req.body);
  res.json(await confirmVisit(id, body));
}

export async function completeVisitHandler(req: AuthedRequest, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  res.json(await completeVisit(id));
}

const visitFormBodySchema = z.object({
  formCategory: z.enum(['A', 'B', 'C', 'D', 'E', 'F']).optional(),
  docsSighted: z.record(z.boolean()).optional(),
  observations: z.record(z.object({
    seen: z.boolean().optional(),
    note: z.string().trim().max(2000).optional(),
  })).optional(),
  visitSummary: z.string().trim().max(8000).optional(),
  submit: z.boolean().optional(),
});

/** GET /:id/form — category-matched on-site form + saved answers. */
export async function getVisitFormHandler(req: AuthedRequest, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  res.json(await getVisitForm(id));
}

/** PUT /:id/form — autosave, or submit (seeds the audit). */
export async function saveVisitFormHandler(req: AuthedRequest, res: Response): Promise<void> {
  const { id } = idParam.parse(req.params);
  const body = visitFormBodySchema.parse(req.body);
  res.json(await saveVisitForm(id, body));
}
