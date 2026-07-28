import { Prisma, type SupplierProfile } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { logger } from '@/infra/logger';
import { register, type PublicUser } from '@/modules/auth/service';
import { notifyPIQSubmitted } from './notify';
import { getAuditTemplate } from './audit-templates';
import type {
  ApplyBody,
  CreatePIQBody,
  UpdatePIQBody,
  UpdateSupplierBody,
} from './schema';

/**
 * Supplier portal service.
 *
 * Identity model: a user becomes a supplier by having ONE SupplierProfile
 * (no separate role/login). Existing AZM accounts keep their single login;
 * the portal gates on whether `getSupplierByUserId` finds a profile.
 */

export interface PublicSupplier {
  id: string;
  companyName: string;
  contactName: string;
  phone: string | null;
  country: string;
  region: string | null;
  category: string;
  currentStage: number;
  status: string;
  legalName: string | null;
  regNumber: string | null;
  taxId: string | null;
  yearEstablished: number | null;
  employees: number | null;
  factoryType: string | null;
  factoryAddress: string | null;
  businessLicenseUrl: string | null;
  createdAt: string;
}

export function toPublicSupplier(p: SupplierProfile): PublicSupplier {
  return {
    id: p.id,
    companyName: p.companyName,
    contactName: p.contactName,
    phone: p.phone ?? null,
    country: p.country,
    region: p.region ?? null,
    category: p.category,
    currentStage: p.currentStage,
    status: p.status,
    legalName: p.legalName ?? null,
    regNumber: p.regNumber ?? null,
    taxId: p.taxId ?? null,
    yearEstablished: p.yearEstablished ?? null,
    employees: p.employees ?? null,
    factoryType: p.factoryType ?? null,
    factoryAddress: p.factoryAddress ?? null,
    businessLicenseUrl: p.businessLicenseUrl ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

/**
 * The portal access check. 404 (not 200-with-null) so the frontend gate
 * and `apiFetchAuthed` can branch cleanly on the status code.
 */
export async function getSupplierByUserId(userId: string): Promise<PublicSupplier> {
  const profile = await prisma.supplierProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw HttpError.notFound('No supplier profile for this account');
  }
  return toPublicSupplier(profile);
}

export interface ApplyResult {
  supplier: PublicSupplier;
  /// Present only when a NEW account was created in the same call, so the
  /// controller can set the refresh cookie and the client can sign in.
  auth?: { user: PublicUser; accessToken: string; refreshToken: string };
}

/**
 * Combined register + apply. When `currentUserId` is set the caller is an
 * existing AZM user; otherwise we create the account first (email +
 * password required) and return tokens alongside the new profile.
 */
export async function applyAsSupplier(
  body: ApplyBody,
  currentUserId: string | undefined,
): Promise<ApplyResult> {
  let userId = currentUserId;
  let auth: ApplyResult['auth'];

  if (!userId) {
    if (!body.email || !body.password) {
      throw HttpError.badRequest(
        'Email and password are required to create your account.',
      );
    }
    // Reuse the auth service so accounts created here are identical to
    // /api/auth/register ones (hashing, refresh token, events).
    const result = await register({
      email: body.email,
      password: body.password,
      name: body.name ?? body.contactName,
    });
    auth = result;
    userId = result.user.id;
  }

  const existing = await prisma.supplierProfile.findUnique({ where: { userId } });
  if (existing) {
    throw HttpError.conflict('This account already has a supplier profile.');
  }

  const profile = await prisma.supplierProfile.create({
    data: {
      userId,
      companyName: body.companyName,
      contactName: body.contactName,
      phone: body.phone ?? null,
      country: body.country,
      region: body.region ?? null,
      category: body.category,
      currentStage: 1,
    },
  });

  logger.info('supplier.applied', { userId, supplierId: profile.id });

  return { supplier: toPublicSupplier(profile), auth };
}

export interface PublicPIQ {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  status: string;
  completion: number;
  createdAt: string;
}

function toPublicPIQ(p: {
  id: string; name: string; brand: string | null; category: string | null;
  status: string; completion: number; createdAt: Date;
}): PublicPIQ {
  return {
    id: p.id, name: p.name, brand: p.brand ?? null, category: p.category ?? null,
    status: p.status, completion: p.completion, createdAt: p.createdAt.toISOString(),
  };
}

async function profileOrThrow(userId: string) {
  const profile = await prisma.supplierProfile.findUnique({ where: { userId } });
  if (!profile) throw HttpError.notFound('No supplier profile for this account');
  return profile;
}

/** GET /me/piqs — list this supplier's product PIQs. */
export async function listPIQs(userId: string): Promise<PublicPIQ[]> {
  const profile = await profileOrThrow(userId);
  const piqs = await prisma.productPIQ.findMany({
    where: { supplierId: profile.id },
    orderBy: { createdAt: 'asc' },
  });
  return piqs.map(toPublicPIQ);
}

/** GET /me/piqs/:id — one PIQ with its answers + any reviewer feedback. */
export async function getPIQ(
  userId: string,
  id: string,
): Promise<
  PublicPIQ & {
    answers: Record<string, unknown>;
    reviewSummary: string | null;
    feedback: Record<string, string> | null;
  }
> {
  const profile = await profileOrThrow(userId);
  const piq = await prisma.productPIQ.findUnique({ where: { id } });
  if (!piq || piq.supplierId !== profile.id) {
    throw HttpError.notFound('PIQ not found');
  }
  return {
    ...toPublicPIQ(piq),
    answers: (piq.answers as Record<string, unknown>) ?? {},
    reviewSummary: piq.reviewSummary ?? null,
    feedback: (piq.feedback as Record<string, string>) ?? null,
  };
}

export interface PublicVisit {
  status: string;
  preferredDate: string | null;
  address: string | null;
  confirmedDate: string | null;
  confirmedWindow: string | null;
  leadName: string | null;
  leadPhone: string | null;
  notes: string | null;
}

/** GET /me/visit — the supplier's facility visit, or null if none yet. */
export async function getVisit(userId: string): Promise<PublicVisit | null> {
  const profile = await profileOrThrow(userId);
  const v = await prisma.facilityVisit.findUnique({ where: { supplierId: profile.id } });
  if (!v) return null;
  return {
    status: v.status,
    preferredDate: v.preferredDate ?? null,
    address: v.address ?? null,
    confirmedDate: v.confirmedDate ? v.confirmedDate.toISOString() : null,
    confirmedWindow: v.confirmedWindow ?? null,
    leadName: v.leadName ?? null,
    leadPhone: v.leadPhone ?? null,
    notes: v.notes ?? null,
  };
}

/** POST /me/visit/request — propose a visit date (idempotent upsert). */
export async function requestVisit(
  userId: string,
  input: { preferredDate: string; address?: string },
): Promise<PublicVisit> {
  const profile = await profileOrThrow(userId);
  const address = input.address ?? profile.factoryAddress ?? null;
  await prisma.facilityVisit.upsert({
    where: { supplierId: profile.id },
    update: { status: 'REQUESTED', preferredDate: input.preferredDate, address, contactPhone: profile.phone },
    create: {
      supplierId: profile.id,
      status: 'REQUESTED',
      preferredDate: input.preferredDate,
      address,
      contactPhone: profile.phone,
    },
  });
  return (await getVisit(userId))!;
}

export interface PublicSupplierAudit {
  status: string;
  category: string | null;
  categoryName: string | null;
  outcome: string | null;
  indicativeScore: number | null;
  counts: Record<string, number> | null;
  summary: string | null;
  recommendations: string | null;
  conductedAt: string | null;
  responses: Record<string, { rating?: string; findings?: string }>;
  capa: unknown[];
  /// The category template (sections + checkpoints) so the supplier can see
  /// the full matrix with requirement labels alongside their ratings.
  template: ReturnType<typeof getAuditTemplate>;
}

/**
 * GET /me/audit — the supplier's product-commodity audit REPORT. Returns null
 * until the Quality & Compliance team has completed it (drafts stay private).
 */
export async function getAudit(userId: string): Promise<PublicSupplierAudit | null> {
  const profile = await profileOrThrow(userId);
  const a = await prisma.supplierAudit.findUnique({ where: { supplierId: profile.id } });
  if (!a || a.status !== 'COMPLETED') return null;
  const template = a.category ? getAuditTemplate(a.category) : null;
  return {
    status: a.status,
    category: a.category ?? null,
    categoryName: template?.name ?? null,
    outcome: a.outcome ?? null,
    indicativeScore: a.indicativeScore ?? null,
    counts: (a.counts as Record<string, number>) ?? null,
    summary: a.summary ?? null,
    recommendations: a.recommendations ?? null,
    conductedAt: a.conductedAt ? a.conductedAt.toISOString() : null,
    responses: (a.responses as Record<string, { rating?: string; findings?: string }>) ?? {},
    capa: (a.capa as unknown[]) ?? [],
    template,
  };
}

/**
 * Facts we already hold about a supplier, mapped onto the field ids the
 * journey forms use.
 *
 * The design rule is "never ask the same thing twice" (PORTAL_ROADMAP §3a):
 * Apply already captured the company name, contact and country, so the EoI
 * and Registration forms must arrive pre-filled rather than asking a supplier
 * to retype what they typed sixty seconds earlier. The form engine renders
 * these with an editable "Autofilled" chip.
 */
async function knownAnswers(
  profile: {
    userId: string;
    companyName: string;
    contactName: string;
    phone: string | null;
    country: string;
    region: string | null;
    legalName: string | null;
    regNumber: string | null;
    taxId: string | null;
    yearEstablished: number | null;
    employees: number | null;
    factoryType: string | null;
    factoryAddress: string | null;
  },
  stage: number,
): Promise<Record<string, unknown>> {
  const user = await prisma.user.findUnique({
    where: { id: profile.userId },
    select: { email: true },
  });
  const stateCountry = [profile.region, profile.country].filter(Boolean).join(', ');

  if (stage === 2) {
    return dropEmpty({
      business_name: profile.companyName,
      contact_name: profile.contactName,
      contact_email: user?.email,
      contact_phone: profile.phone,
      state_country: stateCountry,
    });
  }
  if (stage === 3) {
    // Registration & Profiling — field ids per PROFILE_FORM in the web repo.
    return dropEmpty({
      legal_name: profile.legalName ?? profile.companyName,
      registration_number: profile.regNumber,
      tax_id: profile.taxId,
      year_established: profile.yearEstablished,
      num_employees: profile.employees,
      factory_type: profile.factoryType,
      factory_address: profile.factoryAddress,
    });
  }
  return {};
}

/** Never seed a field with null/empty — an empty chip reads as a bug. */
function dropEmpty(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ''),
  );
}

/** GET /me/stages/:stage — saved answers for a journey form (1–3). */
export async function getStageAnswers(
  userId: string,
  stage: number,
): Promise<Record<string, unknown>> {
  const profile = await profileOrThrow(userId);
  const all = (profile.stageAnswers as Record<string, Record<string, unknown>> | null) ?? {};
  const seed = await knownAnswers(profile, stage);

  // Saved answers always win — the supplier may have corrected a seeded
  // value, and we must never overwrite their edit with the profile again.
  if (all[stage]) return { ...seed, ...all[stage] };

  // Stage 2 (EoI) falls back to imported eoiAnswers so the supplier sees
  // what they originally submitted on the Google form.
  if (stage === 2 && profile.eoiAnswers) {
    return { ...seed, ...(profile.eoiAnswers as Record<string, unknown>) };
  }
  return seed;
}

/** PUT /me/stages/:stage — autosave a journey form's answers. */
export async function saveStageAnswers(
  userId: string,
  stage: number,
  answers: Record<string, unknown>,
): Promise<{ ok: true }> {
  const profile = await profileOrThrow(userId);
  const all = (profile.stageAnswers as Record<string, unknown> | null) ?? {};
  all[String(stage)] = answers;
  await prisma.supplierProfile.update({
    where: { userId },
    data: { stageAnswers: all as Prisma.InputJsonValue },
  });
  return { ok: true };
}

/** POST /me/stages/:stage/complete — save + advance the journey. */
export async function completeStage(
  userId: string,
  stage: number,
  answers: Record<string, unknown>,
): Promise<PublicSupplier> {
  const profile = await profileOrThrow(userId);

  // The journey is strictly sequential, and this is the only place that
  // enforces it. `StageAccessGate` in the web app is client-side, so without
  // this check a brand-new supplier could POST /me/stages/9/complete and land
  // on Stage 10 — skipping the product audit and the partnership agreement
  // entirely. Verified: that exact call used to return 200.
  //
  // Re-completing an earlier stage stays allowed: suppliers legitimately go
  // back and revise Discovery or their EoI, and `nextStage` below never moves
  // anyone backwards.
  if (stage > profile.currentStage) {
    throw HttpError.badRequest(
      `You're currently at stage ${profile.currentStage}. Complete that before moving to stage ${stage}.`,
    );
  }

  const all = (profile.stageAnswers as Record<string, unknown> | null) ?? {};
  all[String(stage)] = answers;
  const nextStage = Math.min(10, Math.max(profile.currentStage, stage + 1));

  const updated = await prisma.supplierProfile.update({
    where: { userId },
    data: {
      stageAnswers: all as Prisma.InputJsonValue,
      currentStage: nextStage,
    },
  });
  return toPublicSupplier(updated);
}

/** POST /me/piqs — start a new product questionnaire. */
export async function createPIQ(userId: string, body: CreatePIQBody): Promise<PublicPIQ> {
  const profile = await profileOrThrow(userId);
  const piq = await prisma.productPIQ.create({
    data: {
      supplierId: profile.id,
      name: body.name,
      category: body.category ?? profile.category,
      status: 'DRAFT',
      completion: 0,
      answers: {},
    },
  });
  return toPublicPIQ(piq);
}

async function ownedPIQ(userId: string, id: string) {
  const profile = await profileOrThrow(userId);
  const piq = await prisma.productPIQ.findUnique({ where: { id } });
  if (!piq || piq.supplierId !== profile.id) throw HttpError.notFound('PIQ not found');
  return piq;
}

/** PUT /me/piqs/:id — autosave answers / name / completion. */
/**
 * A supplier may only edit a questionnaire that is theirs to work on.
 *
 * DRAFT is obvious. REVISION_REQUIRED is the whole point of the revision
 * loop — the reviewer asked for changes, so changes must be possible.
 *
 * Everything else is locked:
 *  - SUBMITTED / UNDER_REVIEW — a reviewer is reading it. Without this a
 *    supplier could rewrite the answers underneath them and get an approval
 *    for something the reviewer never saw.
 *  - APPROVED — approval has to mean the thing that was approved. This is a
 *    compliance programme; silently editing an approved product's answers
 *    afterwards would make the audit trail worthless.
 *  - REJECTED — terminal. Start a new product instead.
 */
const EDITABLE_PIQ_STATUSES = new Set(['DRAFT', 'REVISION_REQUIRED']);

export async function updatePIQ(
  userId: string,
  id: string,
  body: UpdatePIQBody,
): Promise<PublicPIQ> {
  const existing = await ownedPIQ(userId, id);
  if (!EDITABLE_PIQ_STATUSES.has(existing.status)) {
    throw HttpError.badRequest(
      existing.status === 'APPROVED'
        ? 'This product has been approved and can no longer be edited. Contact the supplier desk if something needs to change.'
        : 'This questionnaire is with our review team and cannot be edited until they respond.',
    );
  }

  const piq = await prisma.productPIQ.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.completion !== undefined && { completion: body.completion }),
      ...(body.answers !== undefined && {
        answers: body.answers as Prisma.InputJsonValue,
      }),
    },
  });
  return toPublicPIQ(piq);
}

/** POST /me/piqs/:id/submit — send for review. */
export async function submitPIQ(userId: string, id: string): Promise<PublicPIQ> {
  const existing = await ownedPIQ(userId, id);

  // Only a draft or a revision may be submitted. Re-submitting something
  // already UNDER_REVIEW re-sent the acknowledgement email each time.
  if (!EDITABLE_PIQ_STATUSES.has(existing.status)) {
    throw HttpError.badRequest(
      existing.status === 'APPROVED'
        ? 'This product is already approved.'
        : 'This questionnaire has already been submitted and is awaiting review.',
    );
  }

  // Server-side floor on what may enter the review queue.
  //
  // The web form already blocks submit until every visible required question
  // is answered — but that check is client-side, so the API accepted a
  // completely empty PIQ (0 answers, 0% complete) and put it UNDER_REVIEW.
  // That is how the "Autosave Test" record ended up in the real queue.
  //
  // The API can't do the *full* required-field check: the question schema
  // lives in the web app, not here (a server-side `PIQConfig` model is the
  // proper long-term fix). It can refuse the obviously-empty case, which is
  // the one that actually pollutes reviewers' queues.
  const answers = (existing.answers as Record<string, unknown> | null) ?? {};
  const answered = Object.values(answers).filter(
    (v) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0),
  );
  if (answered.length === 0) {
    throw HttpError.badRequest(
      'This questionnaire is empty. Fill in your product details before submitting it for review.',
    );
  }

  const piq = await prisma.productPIQ.update({
    where: { id },
    data: { status: 'UNDER_REVIEW' },
  });

  // Acknowledgement email to the supplier (best-effort; never blocks submit).
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, supplierProfile: { select: { contactName: true } } },
  });
  if (user) {
    await notifyPIQSubmitted({
      to: user.email,
      userId,
      recipientName: user.name ?? user.supplierProfile?.contactName ?? 'there',
      productName: piq.name,
    });
  }

  return toPublicPIQ(piq);
}

export async function updateSupplier(
  userId: string,
  body: UpdateSupplierBody,
): Promise<PublicSupplier> {
  // Ensure the profile exists + belongs to this user.
  const profile = await prisma.supplierProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw HttpError.notFound('No supplier profile for this account');
  }
  if (Object.keys(body).length === 0) {
    return toPublicSupplier(profile);
  }

  const updated = await prisma.supplierProfile.update({
    where: { userId },
    data: {
      ...(body.companyName !== undefined && { companyName: body.companyName }),
      ...(body.contactName !== undefined && { contactName: body.contactName }),
      ...(body.phone !== undefined && { phone: body.phone }),
      ...(body.country !== undefined && { country: body.country }),
      ...(body.region !== undefined && { region: body.region }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.legalName !== undefined && { legalName: body.legalName }),
      ...(body.regNumber !== undefined && { regNumber: body.regNumber }),
      ...(body.taxId !== undefined && { taxId: body.taxId }),
      ...(body.yearEstablished !== undefined && { yearEstablished: body.yearEstablished }),
      ...(body.employees !== undefined && { employees: body.employees }),
      ...(body.factoryType !== undefined && { factoryType: body.factoryType }),
      ...(body.factoryAddress !== undefined && { factoryAddress: body.factoryAddress }),
      ...(body.businessLicenseUrl !== undefined && {
        businessLicenseUrl: body.businessLicenseUrl,
      }),
    },
  });

  return toPublicSupplier(updated);
}
