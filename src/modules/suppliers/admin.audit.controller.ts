import type { Response } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '@/middleware/auth';
import { completeAuditBodySchema, saveAuditBodySchema } from './audit.schema';
import {
  completeAudit,
  getAuditForAdmin,
  listAuditQueue,
  listAuditTemplates,
  saveAudit,
} from './admin.audit.service';
import { getAuditTemplate } from './audit-templates';
import { HttpError } from '@/middleware/error-handler';

const idParam = z.object({ supplierId: z.string().min(1) });

export async function listAuditQueueHandler(req: AuthedRequest, res: Response): Promise<void> {
  res.json({ items: await listAuditQueue() });
}

export async function listTemplatesHandler(_req: AuthedRequest, res: Response): Promise<void> {
  res.json({ items: listAuditTemplates() });
}

export async function getTemplateHandler(req: AuthedRequest, res: Response): Promise<void> {
  const { category } = z.object({ category: z.string().min(1) }).parse(req.params);
  const template = getAuditTemplate(category);
  if (!template) throw HttpError.notFound('Unknown audit category');
  res.json(template);
}

export async function getAuditHandler(req: AuthedRequest, res: Response): Promise<void> {
  const { supplierId } = idParam.parse(req.params);
  res.json(await getAuditForAdmin(supplierId));
}

export async function saveAuditHandler(req: AuthedRequest, res: Response): Promise<void> {
  const { supplierId } = idParam.parse(req.params);
  const body = saveAuditBodySchema.parse(req.body);
  res.json(await saveAudit(supplierId, body));
}

export async function completeAuditHandler(req: AuthedRequest, res: Response): Promise<void> {
  const { supplierId } = idParam.parse(req.params);
  const body = completeAuditBodySchema.parse(req.body);
  res.json(await completeAudit(supplierId, body));
}
