import { z } from 'zod';

/**
 * Digitized Supplier Product-Commodity Audit (SP-CA). Category-specific
 * checklist (AUDIT_TEMPLATES) rated on the unified report model:
 * C/M/Mi/O/Cpt/NA per checkpoint. Draft saves are partial; completing
 * requires every checkpoint rated.
 */

export const RATINGS = ['C', 'M', 'Mi', 'O', 'Cpt', 'NA'] as const;
const rating = z.enum(RATINGS);

const responseEntry = z.object({
  rating: rating.optional(),
  findings: z.string().trim().max(2000).optional(),
});

const capaRow = z.object({
  ref: z.string().trim().max(40).optional(),
  nonConformity: z.string().trim().max(1000).optional(),
  rootCause: z.string().trim().max(1000).optional(),
  action: z.string().trim().max(1000).optional(),
  owner: z.string().trim().max(120).optional(),
  deadline: z.string().trim().max(60).optional(),
  status: z.string().trim().max(60).optional(),
});

/** PUT — autosave a draft; everything optional. */
export const saveAuditBodySchema = z.object({
  category: z.enum(['A', 'B', 'C', 'D', 'E', 'F']).optional(),
  metadata: z.record(z.string().max(2000)).optional(),
  preVisitDocs: z.record(z.boolean()).optional(),
  responses: z.record(responseEntry).optional(),
  capa: z.array(capaRow).max(100).optional(),
  summary: z.string().trim().max(8000).optional(),
  recommendations: z.string().trim().max(8000).optional(),
  auditorName: z.string().trim().max(120).optional(),
});

/** POST /complete — needs the category, an outcome narrative, and an auditor. */
export const completeAuditBodySchema = saveAuditBodySchema.extend({
  category: z.enum(['A', 'B', 'C', 'D', 'E', 'F']),
  summary: z.string().trim().min(1).max(8000),
  auditorName: z.string().trim().min(1).max(120),
  responses: z.record(responseEntry),
});

export type SaveAuditBody = z.infer<typeof saveAuditBodySchema>;
export type CompleteAuditBody = z.infer<typeof completeAuditBodySchema>;
