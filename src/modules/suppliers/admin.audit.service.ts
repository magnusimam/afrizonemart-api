import { Prisma, type SupplierAudit } from '@prisma/client';
import { env } from '@/config/env';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { logger } from '@/infra/logger';
import { notifyAuditComplete, notifyAuditReportFiled } from './notify';
import { AUDIT_TEMPLATES, getAuditTemplate, templateCheckpointIds } from './audit-templates';
import { scoreAssessment } from './assessment/scoring';
import { checkCompleteness, resolveChecklist, type ResolvedChecklist } from './assessment/resolver';
import { allProductClasses, getProtocol, protocolFor } from './assessment/protocols';
import { buildReport, type DiagnosticReport } from './assessment/report';
import { renderReportPdf } from './assessment/pdf';
import { emptyProfile, type AssessmentProfile } from './assessment/profile';
import type { CompleteAuditBody, IssueChecklistBody, SaveAuditBody } from './audit.schema';

/**
 * Quality & Compliance — the digitized Supplier Product-Commodity Audit.
 * Gated by `suppliers.audit`. Auditors pick the category template, rate every
 * checkpoint (C/M/Mi/O/Cpt/NA), and complete to compute the indicative score
 * + outcome and generate the diagnostic report. Critical findings auto-fail.
 */

type Rating = 'C' | 'M' | 'Mi' | 'O' | 'Cpt' | 'NA';
type ResponseMap = Record<string, { rating?: Rating; findings?: string }>;

export interface AuditCounts {
  critical: number;
  major: number;
  minor: number;
  observation: number;
  compliant: number;
  na: number;
}

/**
 * Indicative score + verdict.
 *
 * Delegates to the assessment scorer, which is a pure function tested against
 * the twelve diagnostic reports AZM has already published. Three behaviours
 * changed when this moved across, each of them a correction rather than a
 * choice:
 *
 * 1. THE SCORE KEEPS HALVES. It used to be rounded to an integer, because the
 *    column was an Int. Oluwatoyin's shipped report scores 94.5 — rounding made
 *    the stored record disagree with the document sent to the supplier.
 * 2. MAJOR SEVERITY IS PER FINDING. The protocol gives the auditor a 1–3 band;
 *    this used to hard-code 2. Ritzy's findings average 1.92, so auditors do
 *    use the band.
 * 3. THE ≤3 MAJOR CAP NOW GATES PROVISIONAL TOO. The scoring legend printed in
 *    every report says "no more than three permitted for any approval outcome",
 *    and a conditional listing is an approval outcome — a facility with twelve
 *    Majors should not earn one on arithmetic alone.
 */
export function scoreAudit(responses: ResponseMap): {
  counts: AuditCounts;
  indicativeScore: number;
  outcome: 'APPROVED' | 'PROVISIONAL' | 'REJECTED';
} {
  const { counts, indicativeScore, outcome } = scoreAssessment(responses);
  return { counts, indicativeScore, outcome };
}

export function listAuditTemplates() {
  return Object.values(AUDIT_TEMPLATES).map((t) => ({ category: t.category, name: t.name, code: t.code }));
}

export interface PublicAudit {
  supplierId: string;
  status: 'DRAFT' | 'COMPLETED' | null;
  category: string | null;
  metadata: Record<string, string>;
  preVisitDocs: Record<string, boolean>;
  responses: ResponseMap;
  capa: unknown[];
  indicativeScore: number | null;
  counts: AuditCounts | null;
  outcome: string | null;
  summary: string | null;
  recommendations: string | null;
  auditorName: string | null;
  conductedAt: string | null;
  /** Lead-auditor sign-off. `approvedAt === null` means not yet released. */
  signedBy: string | null;
  approvedAt: string | null;
  /**
   * The protocol and the frozen checklist this audit was carried out against.
   *
   * The admin editor renders from this rather than re-fetching a category
   * template: responses are keyed by checkpoint ref (`B.4`), whereas the legacy
   * templates key by generated id (`A_s0_1`), so rendering the template against
   * these responses silently shows every checkpoint as unrated.
   */
  protocolCode: string | null;
  protocolVersion: string | null;
  checklistSnapshot: unknown | null;
}

function toPublicAudit(supplierId: string, a: SupplierAudit | null): PublicAudit {
  return {
    supplierId,
    status: a?.status ?? null,
    category: a?.category ?? null,
    metadata: (a?.metadata as Record<string, string>) ?? {},
    preVisitDocs: (a?.preVisitDocs as Record<string, boolean>) ?? {},
    responses: (a?.responses as ResponseMap) ?? {},
    capa: (a?.capa as unknown[]) ?? [],
    indicativeScore: a?.indicativeScore ?? null,
    counts: (a?.counts as unknown as AuditCounts) ?? null,
    outcome: a?.outcome ?? null,
    summary: a?.summary ?? null,
    recommendations: a?.recommendations ?? null,
    auditorName: a?.auditorName ?? null,
    conductedAt: a?.conductedAt ? a.conductedAt.toISOString() : null,
    signedBy: a?.signedBy ?? null,
    approvedAt: a?.approvedAt ? a.approvedAt.toISOString() : null,
    protocolCode: a?.protocolCode ?? null,
    protocolVersion: a?.protocolVersion ?? null,
    checklistSnapshot: a?.checklistSnapshot ?? null,
  };
}

/** GET / — audit candidates: suppliers who've reached the audit stage. */
export async function listAuditQueue() {
  const suppliers = await prisma.supplierProfile.findMany({
    where: { OR: [{ currentStage: { gte: 6 } }, { audit: { isNot: null } }] },
    include: {
      user: { select: { email: true } },
      audit: { select: { status: true, category: true, outcome: true, indicativeScore: true, conductedAt: true } },
      facilityVisit: { select: { status: true } },
      _count: { select: { piqs: true } },
    },
    orderBy: { updatedAt: 'asc' },
  });
  return suppliers.map((s) => ({
    supplierId: s.id,
    company: s.companyName,
    contact: s.contactName,
    email: s.user.email,
    country: s.country,
    category: s.category,
    currentStage: s.currentStage,
    products: s._count.piqs,
    visitStatus: s.facilityVisit?.status ?? null,
    auditStatus: s.audit?.status ?? null,
    auditCategory: s.audit?.category ?? null,
    outcome: s.audit?.outcome ?? null,
    indicativeScore: s.audit?.indicativeScore ?? null,
    conductedAt: s.audit?.conductedAt ? s.audit.conductedAt.toISOString() : null,
  }));
}

async function supplierOrThrow(supplierId: string) {
  const supplier = await prisma.supplierProfile.findUnique({
    where: { id: supplierId },
    include: { user: { select: { email: true, name: true } }, audit: true },
  });
  if (!supplier) throw HttpError.notFound('Supplier not found');
  return supplier;
}

/** GET /:supplierId — supplier header + saved audit (template fetched separately). */
export async function getAuditForAdmin(supplierId: string) {
  const supplier = await supplierOrThrow(supplierId);
  return {
    company: supplier.companyName,
    contact: supplier.contactName,
    email: supplier.user.email,
    country: supplier.country,
    category: supplier.category,
    currentStage: supplier.currentStage,
    audit: toPublicAudit(supplierId, supplier.audit),
  };
}

function auditData(body: SaveAuditBody | CompleteAuditBody): Prisma.SupplierAuditUncheckedUpdateInput {
  const d: Record<string, unknown> = {};
  if (body.category !== undefined) d.category = body.category;
  if (body.metadata !== undefined) d.metadata = body.metadata as Prisma.InputJsonValue;
  if (body.preVisitDocs !== undefined) d.preVisitDocs = body.preVisitDocs as Prisma.InputJsonValue;
  if (body.responses !== undefined) d.responses = body.responses as Prisma.InputJsonValue;
  if (body.capa !== undefined) d.capa = body.capa as Prisma.InputJsonValue;
  if (body.summary !== undefined) d.summary = body.summary;
  if (body.recommendations !== undefined) d.recommendations = body.recommendations;
  if (body.auditorName !== undefined) d.auditorName = body.auditorName;
  return d as Prisma.SupplierAuditUncheckedUpdateInput;
}

/** PUT /:supplierId — autosave a draft. */
/**
 * A completed audit is a signed compliance record, not a working document.
 *
 * Both save and complete used a bare `upsert`, so a COMPLETED audit could be
 * silently overwritten — new findings, a new score, a different outcome, and
 * another `supplier.audit.complete` email to the supplier — with no trace of
 * the original. The admin UI already treats completed audits as read-only;
 * the API did not, which is the same client-trusting split as the PIQ editor.
 *
 * Correcting a genuine error should be an explicit amendment (a new revision
 * with its own record), not an in-place rewrite. Until that exists, refuse.
 */
async function refuseIfCompleted(supplierId: string): Promise<void> {
  const existing = await prisma.supplierAudit.findUnique({
    where: { supplierId },
    select: { status: true },
  });
  if (existing?.status === 'COMPLETED') {
    throw HttpError.badRequest(
      'This audit is complete and its report has been issued. It cannot be edited or re-run.',
    );
  }
}

/**
 * POST /:supplierId/checklist — resolve and issue the customised checklist.
 *
 * This is the step that replaces a coordinator reading a PIQ and choosing a
 * form. It runs once, and the result is frozen onto the audit together with the
 * protocol version and the facts it was derived from.
 *
 * Re-issuing is refused once the audit is completed for the same reason edits
 * are: the checklist is part of the evidence, and swapping it under a signed
 * result would leave a report citing checkpoints nobody was assessed against.
 */
export async function issueChecklist(supplierId: string, body: IssueChecklistBody) {
  await supplierOrThrow(supplierId);
  await refuseIfCompleted(supplierId);

  const protocol = protocolFor(body.productClass);
  if (!protocol) {
    throw HttpError.badRequest(
      `No assessment protocol covers "${body.productClass}". Known classes: ${allProductClasses().join(', ')}.`,
    );
  }

  const profile: AssessmentProfile = {
    ...emptyProfile(body.productClass),
    ...body.profile,
  } as AssessmentProfile;

  const checklist = resolveChecklist(protocol, profile);

  const a = await prisma.supplierAudit.upsert({
    where: { supplierId },
    update: {
      protocolCode: protocol.code,
      protocolVersion: protocol.version,
      checklistSnapshot: checklist as unknown as Prisma.InputJsonValue,
      assessmentProfile: profile as unknown as Prisma.InputJsonValue,
    },
    create: {
      supplierId,
      status: 'DRAFT',
      protocolCode: protocol.code,
      protocolVersion: protocol.version,
      checklistSnapshot: checklist as unknown as Prisma.InputJsonValue,
      assessmentProfile: profile as unknown as Prisma.InputJsonValue,
    },
  });

  logger.info('supplier.audit.checklist_issued', {
    supplierId,
    protocol: protocol.code,
    included: checklist.items.length,
    excluded: checklist.excluded.length,
  });

  return { audit: toPublicAudit(supplierId, a), checklist };
}

export async function saveAudit(supplierId: string, body: SaveAuditBody) {
  await supplierOrThrow(supplierId);
  await refuseIfCompleted(supplierId);
  const data = auditData(body);
  const a = await prisma.supplierAudit.upsert({
    where: { supplierId },
    update: data,
    create: { supplierId, status: 'DRAFT', ...(data as object) },
  });
  return toPublicAudit(supplierId, a);
}

/** POST /:supplierId/complete — score, generate report, route onward. */
export async function completeAudit(supplierId: string, body: CompleteAuditBody) {
  const supplier = await supplierOrThrow(supplierId);
  await refuseIfCompleted(supplierId);
  const template = getAuditTemplate(body.category);
  if (!template) throw HttpError.badRequest('Unknown audit category.');

  /**
   * Completion is judged against the checklist that was actually ISSUED, not
   * against the whole category catalogue.
   *
   * The catalogue-wide check is what breaks under customisation: a supplier
   * whose product makes fourteen checkpoints inapplicable — ZAO, single-
   * ingredient cold-pressed coconut oil — could never be completed, because the
   * cassava and fortification checkpoints they were never shown would count as
   * unrated forever.
   *
   * Falls back to the catalogue-wide check for audits created before checklists
   * were resolved, so existing drafts still complete.
   */
  const existing = await prisma.supplierAudit.findUnique({
    where: { supplierId },
    select: { checklistSnapshot: true },
  });
  const checklist = existing?.checklistSnapshot as ResolvedChecklist | null;

  if (checklist?.items?.length) {
    const { complete, missing, unjustified } = checkCompleteness(checklist, body.responses);
    if (!complete) {
      if (missing.length > 0) {
        throw HttpError.badRequest(
          `Rate all checkpoints before completing — ${missing.length} still unrated (${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}).`,
        );
      }
      // Rating a checkpoint above its documented default is a judgement call,
      // and an unexplained one is not defensible to the supplier it downgrades.
      throw HttpError.badRequest(
        `Explain the severity chosen for ${unjustified.join(', ')} — each is rated above the protocol default.`,
      );
    }
  } else {
    const ids = templateCheckpointIds(body.category);
    const missing = ids.filter((id) => !body.responses[id]?.rating);
    if (missing.length > 0) {
      throw HttpError.badRequest(`Rate all checkpoints before completing — ${missing.length} still unrated.`);
    }
  }

  const { counts, indicativeScore, outcome } = scoreAudit(body.responses as ResponseMap);
  const data = auditData(body);

  const a = await prisma.supplierAudit.upsert({
    where: { supplierId },
    update: { ...data, status: 'COMPLETED', conductedAt: new Date(), indicativeScore, counts: counts as unknown as Prisma.InputJsonValue, outcome },
    create: { supplierId, status: 'COMPLETED', conductedAt: new Date(), indicativeScore, counts: counts as unknown as Prisma.InputJsonValue, outcome, ...(data as object) },
  });

  // Routing: a clean pass advances to Stage 7 (Partnership). Provisional and
  // rejected stay put — the supplier works the CAPA / remediation first.
  if (outcome === 'APPROVED') {
    await prisma.supplierProfile.update({
      where: { id: supplierId },
      data: { currentStage: Math.max(supplier.currentStage, 7) },
    });
  }

  // NO EMAIL HERE — deliberately.
  //
  // Completing an audit means every checkpoint is rated; it does not mean a
  // lead auditor has stood behind the result. The supplier is notified from
  // `authoriseAudit` below, once someone has signed it. Sending here would
  // deliver a verdict to a real business before any human had approved it.
  return toPublicAudit(supplierId, a);
}

/**
 * The human review gate: a lead auditor types their legal name to authorise a
 * completed audit, and only then is the report released to the supplier.
 *
 * Idempotent by design — re-authorising an already-authorised audit is a no-op
 * rather than a second email to the supplier.
 */
export async function authoriseAudit(
  supplierId: string,
  input: { signedBy: string },
  approvedById: string,
) {
  const supplier = await prisma.supplierProfile.findUnique({
    where: { id: supplierId },
    include: { user: { select: { email: true, name: true } }, audit: true },
  });
  if (!supplier) throw HttpError.notFound('Supplier not found');

  const audit = supplier.audit;
  if (!audit) throw HttpError.badRequest('This supplier has no audit to authorise.');
  if (audit.status !== 'COMPLETED') {
    throw HttpError.badRequest('Complete the audit before authorising it.');
  }
  if (audit.approvedAt) {
    // Already released — return current state rather than re-notifying.
    return toPublicAudit(supplierId, audit);
  }

  const signedBy = input.signedBy.trim();
  if (signedBy.length < 3) {
    throw HttpError.badRequest('Enter your full name as your signature.');
  }

  const updated = await prisma.supplierAudit.update({
    where: { supplierId },
    data: { signedBy, approvedById, approvedAt: new Date() },
  });

  logger.info('supplier.audit.authorised', { supplierId, approvedById, signedBy });

  const outcome = (updated.outcome ?? 'PROVISIONAL') as 'APPROVED' | 'PROVISIONAL' | 'REJECTED';

  // Build and print the report. Every step here is best-effort: the audit is
  // already signed and recorded, so nothing below may throw its way out and
  // turn a completed authorisation into a failed request. Worst case the
  // supplier gets the verdict email without an attachment and reads the report
  // in the portal.
  // An audit carrying `reportFileUrl` was issued as a document before the
  // portal could generate one. That file is what the QA team signed, so it is
  // what the supplier receives: a regenerated PDF would be a different
  // artefact making the same claims, and for a verdict that decides whether a
  // business can list, "equivalent" is not the same as "the one you signed".
  let attachment: { filename: string; content: Buffer } | null = null;
  let report: ReturnType<typeof buildReportFor> = null;

  if (updated.reportFileUrl) {
    attachment = await fetchIssuedReport(
      updated.reportFileUrl,
      updated.reportFileName ?? 'Afrizonemart-Diagnostic-Report',
      supplierId,
    );
  } else {
    report = buildReportFor(supplier, updated, signedBy);
    const pdf = report ? await renderReportPdf(report) : null;
    if (report && !pdf) {
      logger.warn('supplier.audit.pdf_unavailable', { supplierId });
    }
    if (pdf) attachment = pdf;
  }

  await notifyAuditComplete({
    to: supplier.user.email,
    userId: supplier.userId,
    recipientName: supplier.user.name ?? supplier.contactName,
    outcome,
    indicativeScore: updated.indicativeScore ?? 0,
    reportPdf: attachment ?? undefined,
  });

  await notifyAuditReportFiled({
    recipients: adminReportRecipients(),
    supplierName: supplier.companyName,
    supplierId,
    outcome,
    indicativeScore: updated.indicativeScore ?? 0,
    signedBy,
    documentCode: report?.meta.documentCode ?? `${updated.protocolCode ?? 'AFZ-QA'} / ${supplierId}`,
    reportPdf: attachment ?? undefined,
  });

  return toPublicAudit(supplierId, updated);
}

/** Configured QA recipients, falling back to the supplier-desk inbox so a
 *  released report always leaves an internal copy behind. */
function adminReportRecipients(): string[] {
  const configured = env.ASSESSMENT_REPORT_ADMIN_RECIPIENTS ?? env.EMAIL_REPLY_TO ?? '';
  return configured.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Rebuild the diagnostic report from what was stored on the audit.
 *
 * Reads the frozen `checklistSnapshot` rather than re-resolving, so the
 * document reflects the checklist the auditor actually worked from — not what
 * the current catalogue would produce for the same supplier today.
 *
 * Returns null for audits predating checklist resolution; those still get their
 * email, just without an attachment.
 */

/**
 * Pull the issued report document back out of storage so it can be attached.
 *
 * Best-effort, like every step after the signature: the audit is already
 * authorised and recorded by this point, so a storage hiccup must not turn a
 * completed authorisation into a failed request. If it fails the supplier
 * still gets the verdict and can download the report from the portal.
 */
async function fetchIssuedReport(
  url: string,
  filename: string,
  supplierId: string,
): Promise<{ filename: string; content: Buffer } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      logger.warn('supplier.audit.report_fetch_failed', { supplierId, status: res.status });
      return null;
    }
    return { filename, content: Buffer.from(await res.arrayBuffer()) };
  } catch (err) {
    logger.warn('supplier.audit.report_fetch_error', {
      supplierId,
      error: (err as Error).message,
    });
    return null;
  }
}

function buildReportFor(
  supplier: { companyName: string; category: string | null },
  audit: SupplierAudit,
  signedBy: string,
): DiagnosticReport | null {
  const checklist = audit.checklistSnapshot as unknown as ResolvedChecklist | null;
  if (!checklist?.items?.length || !audit.protocolCode) return null;

  const protocol = getProtocol(audit.protocolCode);
  if (!protocol) {
    logger.warn('supplier.audit.protocol_missing', { protocolCode: audit.protocolCode });
    return null;
  }

  try {
    const report = buildReport({
      protocol,
      checklist,
      responses: (audit.responses ?? {}) as Record<string, never>,
      supplierName: supplier.companyName,
      supplierSlug: audit.reportSlug ?? fallbackSlug(supplier.companyName),
      productDescriptor: supplier.category ?? 'Supplier',
      issuedAt: audit.approvedAt ?? new Date(),
    });
    // The signature belongs on the released document.
    report.signOff.statement += ` Authorised by ${signedBy}.`;
    return report;
  } catch (error) {
    logger.error('supplier.audit.report_build_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Used only when no slug was recorded. Deliberately crude — the point of the
 *  stored column is that no rule reproduces the real ones. */
function fallbackSlug(companyName: string): string {
  return companyName.replace(/[^A-Za-z0-9]+/g, '').slice(0, 12).toUpperCase() || 'SUPPLIER';
}
