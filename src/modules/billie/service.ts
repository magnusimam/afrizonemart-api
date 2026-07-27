import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';

/**
 * Read-only supplier-network queries for the B.I.L.L.I.E. voice assistant.
 *
 * Shapes here are tuned for being *spoken aloud*, not for rendering a table:
 * short flat fields, resolved labels instead of ids, and no giant answer
 * blobs. Every query is a single indexed round-trip, comfortably under the
 * five-second budget a live voice call allows — so none of this needs the
 * job/poll treatment.
 */

/** The 10-stage onboarding journey, mirrored from the web app. */
const STAGE_NAMES: Record<number, string> = {
  1: 'Discovery',
  2: 'Expression of Interest',
  3: 'Registration & Profiling',
  4: 'Product Questionnaire',
  5: 'Orientation',
  6: 'Product Audit',
  7: 'Partnership',
  8: 'Activation & Listing',
  9: 'Trade Engagement',
  10: 'Continuous Engagement',
};

export function stageName(stage: number): string {
  return STAGE_NAMES[stage] ?? `Stage ${stage}`;
}

export interface SupplierListParams {
  query?: string;
  stage?: number;
  status?: string;
  limit: number;
}

/** GET /api/billie/suppliers — search / filter the network. */
export async function listSuppliers(params: SupplierListParams) {
  const { query, stage, status, limit } = params;

  const suppliers = await prisma.supplierProfile.findMany({
    where: {
      ...(stage !== undefined ? { currentStage: stage } : {}),
      ...(status ? { status: status as never } : {}),
      ...(query
        ? {
            OR: [
              { companyName: { contains: query, mode: 'insensitive' as const } },
              { contactName: { contains: query, mode: 'insensitive' as const } },
              { category: { contains: query, mode: 'insensitive' as const } },
              { country: { contains: query, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      companyName: true,
      contactName: true,
      country: true,
      category: true,
      currentStage: true,
      status: true,
      createdAt: true,
      _count: { select: { piqs: true } },
    },
    orderBy: [{ currentStage: 'desc' }, { companyName: 'asc' }],
    take: limit,
  });

  return {
    count: suppliers.length,
    suppliers: suppliers.map((s) => ({
      id: s.id,
      companyName: s.companyName,
      contactName: s.contactName,
      country: s.country,
      category: s.category,
      stage: s.currentStage,
      stageName: stageName(s.currentStage),
      status: s.status,
      products: s._count.piqs,
      joinedAt: s.createdAt.toISOString(),
    })),
  };
}

/** GET /api/billie/suppliers/:id — one supplier, with journey detail. */
export async function getSupplier(id: string) {
  const s = await prisma.supplierProfile.findUnique({
    where: { id },
    select: {
      id: true,
      companyName: true,
      contactName: true,
      phone: true,
      country: true,
      region: true,
      category: true,
      currentStage: true,
      status: true,
      legalName: true,
      yearEstablished: true,
      employees: true,
      factoryType: true,
      cluster: true,
      createdAt: true,
      user: { select: { email: true } },
      piqs: {
        select: { id: true, name: true, status: true, completion: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      },
      facilityVisit: {
        select: { status: true, preferredDate: true, confirmedDate: true, confirmedWindow: true },
      },
      audit: {
        select: { status: true, outcome: true, indicativeScore: true, conductedAt: true },
      },
      reviewCall: { select: { status: true, scheduledAt: true, meetingMode: true } },
      purchaseOrders: {
        select: { poNumber: true, status: true, currency: true, totalAmount: true, dueDate: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!s) throw HttpError.notFound('No supplier with that id');

  return {
    id: s.id,
    companyName: s.companyName,
    contactName: s.contactName,
    email: s.user?.email ?? null,
    phone: s.phone,
    country: s.country,
    region: s.region,
    category: s.category,
    cluster: s.cluster,
    stage: s.currentStage,
    stageName: stageName(s.currentStage),
    status: s.status,
    legalName: s.legalName,
    yearEstablished: s.yearEstablished,
    employees: s.employees,
    factoryType: s.factoryType,
    joinedAt: s.createdAt.toISOString(),
    products: s.piqs.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      completion: p.completion,
      updatedAt: p.updatedAt.toISOString(),
    })),
    facilityVisit: s.facilityVisit
      ? {
          status: s.facilityVisit.status,
          // Stored as a free-text date string (what the supplier proposed).
          preferredDate: s.facilityVisit.preferredDate,
          confirmedDate: s.facilityVisit.confirmedDate?.toISOString() ?? null,
          window: s.facilityVisit.confirmedWindow,
        }
      : null,
    audit: s.audit
      ? {
          status: s.audit.status,
          outcome: s.audit.outcome,
          score: s.audit.indicativeScore,
          conductedAt: s.audit.conductedAt?.toISOString() ?? null,
        }
      : null,
    reviewCall: s.reviewCall
      ? {
          status: s.reviewCall.status,
          scheduledAt: s.reviewCall.scheduledAt?.toISOString() ?? null,
          mode: s.reviewCall.meetingMode,
        }
      : null,
    purchaseOrders: s.purchaseOrders.map((po) => ({
      poNumber: po.poNumber,
      status: po.status,
      currency: po.currency,
      total: po.totalAmount,
      dueDate: po.dueDate?.toISOString() ?? null,
    })),
  };
}

/**
 * GET /api/billie/overview — the "how is the supplier network doing?"
 * answer, in one call. Built to be read aloud in a sentence or two.
 */
export async function getOverview() {
  const [total, active, byStage, piqsByStatus, visitsPending, auditsDone, posOpen] =
    await Promise.all([
      prisma.supplierProfile.count(),
      prisma.supplierProfile.count({ where: { status: 'ACTIVE' } }),
      prisma.supplierProfile.groupBy({ by: ['currentStage'], _count: { _all: true } }),
      prisma.productPIQ.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.facilityVisit.count({ where: { status: 'REQUESTED' } }),
      prisma.supplierAudit.count({ where: { status: 'COMPLETED' } }),
      prisma.purchaseOrder.count({ where: { status: { in: ['ISSUED', 'ACKNOWLEDGED'] } } }),
    ]);

  const stages = byStage
    .map((row) => ({
      stage: row.currentStage,
      stageName: stageName(row.currentStage),
      suppliers: row._count._all,
    }))
    .sort((a, b) => a.stage - b.stage);

  const piqs: Record<string, number> = {};
  for (const row of piqsByStatus) piqs[row.status] = row._count._all;

  return {
    suppliers: { total, active, suspended: total - active },
    byStage: stages,
    products: {
      total: Object.values(piqs).reduce((sum, n) => sum + n, 0),
      byStatus: piqs,
      awaitingReview: (piqs.SUBMITTED ?? 0) + (piqs.UNDER_REVIEW ?? 0),
    },
    actionQueue: {
      piqsAwaitingReview: (piqs.SUBMITTED ?? 0) + (piqs.UNDER_REVIEW ?? 0),
      visitsAwaitingConfirmation: visitsPending,
      openPurchaseOrders: posOpen,
    },
    auditsCompleted: auditsDone,
  };
}

/**
 * GET /api/billie/products — PIQs across the network, filterable by status.
 * The natural answer to "what's waiting on my review?".
 */
export async function listProducts(params: { status?: string; limit: number }) {
  const piqs = await prisma.productPIQ.findMany({
    where: params.status ? { status: params.status as never } : {},
    select: {
      id: true,
      name: true,
      status: true,
      completion: true,
      updatedAt: true,
      supplier: { select: { id: true, companyName: true, country: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: params.limit,
  });

  return {
    count: piqs.length,
    products: piqs.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      completion: p.completion,
      updatedAt: p.updatedAt.toISOString(),
      supplierId: p.supplier.id,
      supplier: p.supplier.companyName,
      country: p.supplier.country,
    })),
  };
}
