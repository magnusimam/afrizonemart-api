import type { Response } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '@/middleware/auth';
import {
  authoriseAuditBodySchema,
  completeAuditBodySchema,
  issueChecklistBodySchema,
  saveAuditBodySchema,
} from './audit.schema';
import {
  authoriseAudit,
  completeAudit,
  getAuditForAdmin,
  issueChecklist,
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

/**
 * POST /:supplierId/checklist — resolve the customised checklist for this
 * supplier's product and freeze it onto the audit.
 */
export async function issueChecklistHandler(req: AuthedRequest, res: Response): Promise<void> {
  const { supplierId } = idParam.parse(req.params);
  const body = issueChecklistBodySchema.parse(req.body);
  res.json(await issueChecklist(supplierId, body));
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

/**
 * POST /:supplierId/authorise — lead auditor signs off, releasing the report
 * to the supplier. The signature is attributed to the authenticated user, not
 * to whatever id the client sends.
 */
export async function authoriseAuditHandler(req: AuthedRequest, res: Response): Promise<void> {
  const { supplierId } = idParam.parse(req.params);
  const body = authoriseAuditBodySchema.parse(req.body);
  if (!req.user) throw HttpError.unauthorized('Sign in to authorise an audit.');
  res.json(await authoriseAudit(supplierId, body, req.user.id));
}
