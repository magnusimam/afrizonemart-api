import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { notifyVisitConfirmed } from './notify';

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
  });

  return { id: updated.id, status: updated.status };
}

export async function completeVisit(id: string) {
  const v = await prisma.facilityVisit.findUnique({ where: { id } });
  if (!v) throw HttpError.notFound('Visit not found');
  const updated = await prisma.facilityVisit.update({ where: { id }, data: { status: 'COMPLETED' } });
  return { id: updated.id, status: updated.status };
}
