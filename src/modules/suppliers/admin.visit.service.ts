import { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { logger } from '@/infra/logger';
import { notifyVisitConfirmed } from './notify';
import { getAuditTemplate } from './audit-templates';

/** Facility-visit team admin — list requests, confirm dates, mark complete. */

export async function listVisits(status?: string) {
  const visits = await prisma.facilityVisit.findMany({
    where: status ? { status: status as never } : {},
    include: { supplier: { select: { companyName: true, country: true, user: { select: { email: true } } } } },
    orderBy: { updatedAt: 'asc' },
  });
  return visits.map((v) => ({
    id: v.id,
    status: v.status,
    preferredDate: v.preferredDate,
    address: v.address,
    contactPhone: v.contactPhone,
    confirmedDate: v.confirmedDate ? v.confirmedDate.toISOString() : null,
    confirmedWindow: v.confirmedWindow,
    leadName: v.leadName,
    leadPhone: v.leadPhone,
    notes: v.notes,
    company: v.supplier.companyName,
    email: v.supplier.user.email,
    country: v.supplier.country,
  }));
}

export async function confirmVisit(
  id: string,
  input: { confirmedDate: string; confirmedWindow?: string; leadName: string; leadPhone?: string; notes?: string },
) {
  const v = await prisma.facilityVisit.findUnique({
    where: { id },
    include: { supplier: { select: { userId: true, contactName: true, user: { select: { email: true, name: true } } } } },
  });
  if (!v) throw HttpError.notFound('Visit not found');
  const confirmedDate = new Date(input.confirmedDate);
  const updated = await prisma.facilityVisit.update({
    where: { id },
    data: {
      status: 'CONFIRMED',
      confirmedDate,
      confirmedWindow: input.confirmedWindow ?? null,
      leadName: input.leadName,
      leadPhone: input.leadPhone ?? null,
      notes: input.notes ?? null,
    },
  });

  await notifyVisitConfirmed({
    to: v.supplier.user.email,
    userId: v.supplier.userId,
    recipientName: v.supplier.user.name ?? v.supplier.contactName,
    dateLabel: confirmedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    window: input.confirmedWindow ?? null,
    address: updated.address,
    leadName: input.leadName,
    leadPhone: input.leadPhone ?? null,
    supplierId: v.supplierId,
    confirmedDate,
  });

  return { id: updated.id, status: updated.status };
}

export async function completeVisit(id: string) {
  const v = await prisma.facilityVisit.findUnique({ where: { id } });
  if (!v) throw HttpError.notFound('Visit not found');
  const updated = await prisma.facilityVisit.update({ where: { id }, data: { status: 'COMPLETED' } });
  return { id: updated.id, status: updated.status };
}

/* ------------------------------------------------------------------ *
 * On-site visit form
 *
 * The form is matched to the supplier's PRODUCT CATEGORY: a cassava-flour
 * mill and a cosmetics line need different questions asked on site, and the
 * audit templates already encode exactly that (preVisitDocs + categoryChecks
 * per category A–F). Reusing them here means the visiting team collects the
 * evidence the auditor is about to score against, rather than a generic
 * checklist someone then has to translate.
 * ------------------------------------------------------------------ */

export interface VisitFormPayload {
  docsSighted?: Record<string, boolean>;
  observations?: Record<string, { seen?: boolean; note?: string }>;
  visitSummary?: string;
  /// Override the category when the supplier's recorded one is wrong — the
  /// team is standing in the facility and can see what's actually made there.
  formCategory?: string;
  submit?: boolean;
}

/**
 * GET /:id/form — the questions for THIS supplier, plus anything saved.
 *
 * Falls back to the supplier's profile category when the form hasn't picked
 * one yet. A category with an empty template is reported honestly rather than
 * rendering an empty form that looks broken.
 */
export async function getVisitForm(id: string) {
  const v = await prisma.facilityVisit.findUnique({
    where: { id },
    include: {
      supplier: {
        select: { id: true, companyName: true, category: true, user: { select: { email: true } } },
      },
    },
  });
  if (!v) throw HttpError.notFound('Visit not found');

  const category = v.formCategory ?? v.supplier.category ?? null;
  const template = category ? getAuditTemplate(category) : null;

  return {
    id: v.id,
    company: v.supplier.companyName,
    email: v.supplier.user.email,
    supplierId: v.supplier.id,
    status: v.status,
    confirmedDate: v.confirmedDate ? v.confirmedDate.toISOString() : null,
    category,
    categoryName: template?.name ?? null,
    /// Empty for categories whose template hasn't been filled in yet — the UI
    /// says so instead of pretending there's nothing to check.
    preVisitDocs: template?.preVisitDocs ?? [],
    categoryChecks: template?.categoryChecks ?? [],
    docsSighted: (v.docsSighted as Record<string, boolean>) ?? {},
    observations: (v.observations as Record<string, { seen?: boolean; note?: string }>) ?? {},
    visitSummary: v.visitSummary ?? '',
    formSubmittedAt: v.formSubmittedAt ? v.formSubmittedAt.toISOString() : null,
  };
}

/** PUT /:id/form — autosave, or submit with `submit: true`. */
export async function saveVisitForm(id: string, body: VisitFormPayload) {
  const v = await prisma.facilityVisit.findUnique({
    where: { id },
    include: { supplier: { select: { id: true, category: true } } },
  });
  if (!v) throw HttpError.notFound('Visit not found');

  if (body.formCategory && !getAuditTemplate(body.formCategory)) {
    throw HttpError.badRequest('Unknown product category.');
  }

  const category = body.formCategory ?? v.formCategory ?? v.supplier.category ?? null;

  await prisma.facilityVisit.update({
    where: { id },
    data: {
      ...(category ? { formCategory: category } : {}),
      ...(body.docsSighted !== undefined && { docsSighted: body.docsSighted as Prisma.InputJsonValue }),
      ...(body.observations !== undefined && { observations: body.observations as Prisma.InputJsonValue }),
      ...(body.visitSummary !== undefined && { visitSummary: body.visitSummary }),
      ...(body.submit ? { formSubmittedAt: new Date() } : {}),
    },
  });

  // Submitting seeds the audit. This is the handoff the whole form exists for:
  // the auditor opens a record already carrying the category, the sighted
  // paperwork and the on-site summary, instead of starting from blank.
  //
  // Only ever CREATES or fills gaps — an auditor who has already started
  // scoring must not have their work overwritten by a late form edit.
  if (body.submit) {
    const existing = await prisma.supplierAudit.findUnique({ where: { supplierId: v.supplier.id } });
    if (!existing) {
      await prisma.supplierAudit.create({
        data: {
          supplierId: v.supplier.id,
          status: 'DRAFT',
          category,
          preVisitDocs: (body.docsSighted ?? {}) as Prisma.InputJsonValue,
          metadata: { visitSummary: body.visitSummary ?? '' } as Prisma.InputJsonValue,
        },
      });
    } else if (existing.status === 'DRAFT') {
      await prisma.supplierAudit.update({
        where: { supplierId: v.supplier.id },
        data: {
          category: existing.category ?? category,
          preVisitDocs: (existing.preVisitDocs ?? body.docsSighted ?? {}) as Prisma.InputJsonValue,
        },
      });
    }
    logger.info('supplier.visit.form_submitted', { visitId: id, supplierId: v.supplier.id, category });
  }

  return getVisitForm(id);
}
