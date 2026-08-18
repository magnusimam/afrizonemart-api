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
  /**
   * Severity within the Major band. The protocol gives the auditor 1–3 points
   * per Major finding; the published reports average about 2, which is the
   * documented mid-range and the default when this is omitted.
   */
  majorPoints: z.number().int().min(1).max(3).optional(),
  /**
   * Red Flag protocol: a *confirmed* exceedance or contamination event —
   * aflatoxin or HCN over limit, mould with no quarantine, unsafe water — is
   * always Critical whatever band the checkpoint normally sits in. Distinct
   * from "the control is absent", which follows the normal rating.
   */
  confirmedFinding: z.boolean().optional(),
  /**
   * Required when the auditor rates a checkpoint MORE severely than its
   * documented default. Without it, "Major" drifts into whatever each auditor
   * takes it to mean and scores stop being comparable between facilities.
   */
  justification: z.string().trim().max(2000).optional(),
  /** 2–6 word status gloss for the report's findings dashboard. */
  statusNote: z.string().trim().max(120).optional(),
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

/**
 * POST /:supplierId/checklist — resolve and issue the customised checklist.
 *
 * The profile is the structured product fact set the checkpoint rules read.
 * It is captured here rather than derived on the fly because the resolution is
 * snapshotted: what a supplier was assessed against must stay answerable months
 * later, whatever the catalogue or their profile says by then.
 */
export const issueChecklistBodySchema = z.object({
  productClass: z.string().trim().min(1).max(60),
  profile: z.object({
    substrates: z.array(z.string().max(40)).max(40).optional(),
    processes: z.array(z.string().max(40)).max(40).optional(),
    labelClaims: z.array(z.string().max(40)).max(40).optional(),
    allergensPresent: z.array(z.string().max(40)).max(20).optional(),
    targetMarkets: z.array(z.string().max(40)).max(10).optional(),
    packagingTypes: z.array(z.string().max(40)).max(20).optional(),
    sharedProductionLines: z.boolean().optional(),
    metalContactSteps: z.boolean().optional(),
    waterUsedInProcess: z.boolean().optional(),
  }).default({}),
});

/**
 * POST /authorise — the human review gate. The typed full name is the lead
 * auditor's signature, so it is required and must be a plausible name rather
 * than a keystroke; the report carries it as the authorising signature.
 */
export const authoriseAuditBodySchema = z.object({
  signedBy: z.string().trim().min(3, 'Enter your full name as your signature.').max(120),
});

export type IssueChecklistBody = z.infer<typeof issueChecklistBodySchema>;
export type SaveAuditBody = z.infer<typeof saveAuditBodySchema>;
export type CompleteAuditBody = z.infer<typeof completeAuditBodySchema>;
export type AuthoriseAuditBody = z.infer<typeof authoriseAuditBodySchema>;
