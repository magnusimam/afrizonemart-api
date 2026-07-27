import { Prisma, type SupplierAudit } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { notifyAuditComplete } from './notify';
import { AUDIT_TEMPLATES, getAuditTemplate, templateCheckpointIds } from './audit-templates';
import type { CompleteAuditBody, SaveAuditBody } from './audit.schema';

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

/** Indicative score + verdict, mirroring the shipped diagnostic reports:
 *  100 − 2·Major − 0.5·Minor; any Critical ⇒ REJECTED. */
export function scoreAudit(responses: ResponseMap): {
  counts: AuditCounts;
  indicativeScore: number;
  outcome: 'APPROVED' | 'PROVISIONAL' | 'REJECTED';
} {
  const counts: AuditCounts = { critical: 0, major: 0, minor: 0, observation: 0, compliant: 0, na: 0 };
  for (const r of Object.values(responses)) {
    switch (r.rating) {
      case 'C': counts.critical++; break;
      case 'M': counts.major++; break;
      case 'Mi': counts.minor++; break;
      case 'O': counts.observation++; break;
      case 'Cpt': counts.compliant++; break;
      case 'NA': counts.na++; break;
    }
  }
  const indicativeScore = Math.max(0, Math.min(100, Math.round(100 - 2 * counts.major - 0.5 * counts.minor)));
  let outcome: 'APPROVED' | 'PROVISIONAL' | 'REJECTED';
  if (counts.critical > 0) outcome = 'REJECTED';
  else if (indicativeScore >= 85 && counts.major <= 3) outcome = 'APPROVED';
  else if (indicativeScore >= 70) outcome = 'PROVISIONAL';
  else outcome = 'REJECTED';
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
export async function saveAudit(supplierId: string, body: SaveAuditBody) {
  await supplierOrThrow(supplierId);
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
  const template = getAuditTemplate(body.category);
  if (!template) throw HttpError.badRequest('Unknown audit category.');

  // Every checkpoint must carry a rating before completion.
  const ids = templateCheckpointIds(body.category);
  const missing = ids.filter((id) => !body.responses[id]?.rating);
  if (missing.length > 0) {
    throw HttpError.badRequest(`Rate all checkpoints before completing — ${missing.length} still unrated.`);
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

  await notifyAuditComplete({
    to: supplier.user.email,
    userId: supplier.userId,
    recipientName: supplier.user.name ?? supplier.contactName,
    outcome,
    indicativeScore,
  });

  return toPublicAudit(supplierId, a);
}
