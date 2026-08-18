import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { logger } from '@/infra/logger';
import { notifyProductionBooked } from './notify';

/**
 * Take50 production — the content shoot at Stage 8.
 *
 * Gated by `suppliers.production`. The crew see only the suppliers who have
 * reached the listing stage; they can book, reschedule, complete and cancel a
 * shoot, and nothing else. Deliberately no access to listings or POs.
 */

export interface PublicProductionBooking {
  supplierId: string;
  company: string;
  contact: string;
  email: string;
  currentStage: number;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | null;
  scheduledAt: string | null;
  location: string | null;
  contactName: string | null;
  contactPhone: string | null;
  productList: string | null;
  notes: string | null;
  completedAt: string | null;
}

export interface BookProductionInput {
  scheduledAt: string;
  location?: string;
  contactName?: string;
  contactPhone?: string;
  productList?: string;
  notes?: string;
}

function toPublic(
  s: {
    id: string; companyName: string; contactName: string; currentStage: number;
    user: { email: string };
    productionBooking: {
      status: string; scheduledAt: Date; location: string | null; contactName: string | null;
      contactPhone: string | null; productList: string | null; notes: string | null; completedAt: Date | null;
    } | null;
  },
): PublicProductionBooking {
  const b = s.productionBooking;
  return {
    supplierId: s.id,
    company: s.companyName,
    contact: s.contactName,
    email: s.user.email,
    currentStage: s.currentStage,
    status: (b?.status as PublicProductionBooking['status']) ?? null,
    scheduledAt: b?.scheduledAt ? b.scheduledAt.toISOString() : null,
    location: b?.location ?? null,
    contactName: b?.contactName ?? null,
    contactPhone: b?.contactPhone ?? null,
    productList: b?.productList ?? null,
    notes: b?.notes ?? null,
    completedAt: b?.completedAt ? b.completedAt.toISOString() : null,
  };
}

const INCLUDE = {
  user: { select: { email: true } },
  productionBooking: true,
} as const;

/**
 * GET / — the production queue.
 *
 * Stage 8 is Activation & Listing, which is when content is shot. Suppliers
 * already past it are still included when they have a booking, so the crew can
 * see recent history rather than having shoots vanish the moment a listing
 * publishes.
 */
export async function listProductionQueue(): Promise<PublicProductionBooking[]> {
  const rows = await prisma.supplierProfile.findMany({
    where: {
      OR: [{ currentStage: { gte: 8 } }, { productionBooking: { isNot: null } }],
    },
    include: INCLUDE,
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map(toPublic);
}

async function supplierOrThrow(supplierId: string) {
  const s = await prisma.supplierProfile.findUnique({
    where: { id: supplierId },
    include: { user: { select: { email: true, name: true } }, productionBooking: true },
  });
  if (!s) throw HttpError.notFound('Supplier not found');
  return s;
}

export async function getProduction(supplierId: string): Promise<PublicProductionBooking> {
  const s = await supplierOrThrow(supplierId);
  return toPublic(s);
}

/**
 * POST /:supplierId/book — schedule (or reschedule) the shoot and email the
 * supplier the call sheet.
 *
 * Upsert rather than create so rescheduling is the same operation; a
 * rescheduled shoot re-notifies deliberately, because the supplier needs the
 * new date. That is why `notifyProductionBooked` is NOT once-ever guarded —
 * unlike the lifecycle emails, this one is keyed to an event that legitimately
 * repeats.
 */
export async function bookProduction(
  supplierId: string,
  input: BookProductionInput,
  bookedById: string,
): Promise<PublicProductionBooking> {
  const s = await supplierOrThrow(supplierId);

  const scheduledAt = new Date(input.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw HttpError.badRequest('Give a valid shoot date and time.');
  }

  const data = {
    status: 'SCHEDULED' as const,
    scheduledAt,
    location: input.location?.trim() || null,
    contactName: input.contactName?.trim() || null,
    contactPhone: input.contactPhone?.trim() || null,
    productList: input.productList?.trim() || null,
    notes: input.notes?.trim() || null,
    completedAt: null,
    bookedById,
  };

  await prisma.productionBooking.upsert({
    where: { supplierId },
    update: data,
    create: { supplierId, ...data },
  });

  logger.info('supplier.production.booked', { supplierId, bookedById, scheduledAt });

  await notifyProductionBooked({
    to: s.user.email,
    userId: s.userId,
    recipientName: s.user.name ?? s.contactName,
    scheduledAt,
    location: data.location,
    contactName: data.contactName,
    contactPhone: data.contactPhone,
    supplierId,
  });

  return getProduction(supplierId);
}

/** POST /:supplierId/complete — the shoot happened. */
export async function completeProduction(supplierId: string): Promise<PublicProductionBooking> {
  const s = await supplierOrThrow(supplierId);
  if (!s.productionBooking) throw HttpError.badRequest('No shoot is booked for this supplier.');

  await prisma.productionBooking.update({
    where: { supplierId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  logger.info('supplier.production.completed', { supplierId });
  return getProduction(supplierId);
}

/**
 * POST /:supplierId/cancel — call it off.
 *
 * No supplier email here on purpose: a cancellation usually comes with a
 * conversation and often an immediate rebooking, and an automated "your shoot
 * is cancelled" arriving before the crew has called is worse than silence.
 * Rebooking sends the new call sheet.
 */
export async function cancelProduction(supplierId: string): Promise<PublicProductionBooking> {
  const s = await supplierOrThrow(supplierId);
  if (!s.productionBooking) throw HttpError.badRequest('No shoot is booked for this supplier.');

  await prisma.productionBooking.update({
    where: { supplierId },
    data: { status: 'CANCELLED' },
  });
  logger.info('supplier.production.cancelled', { supplierId });
  return getProduction(supplierId);
}
