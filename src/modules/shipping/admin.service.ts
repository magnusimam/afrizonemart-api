import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import type {
  PartialRateBody,
  PartialZoneBody,
  UpsertRateBody,
  UpsertZoneBody,
} from './admin.schema';

// ---------- Zones ----------

export async function adminListZones() {
  const items = await prisma.shippingZone.findMany({
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    include: { rates: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] } },
  });
  return { items };
}

async function ensureSingleDefaultZone(currentlyDefaultId?: string) {
  // Set isDefault=false on every zone OTHER than the one we're saving.
  await prisma.shippingZone.updateMany({
    where: {
      isDefault: true,
      ...(currentlyDefaultId ? { NOT: { id: currentlyDefaultId } } : {}),
    },
    data: { isDefault: false },
  });
}

export async function adminCreateZone(body: UpsertZoneBody) {
  if (!body.isDefault && body.countries.length === 0) {
    throw HttpError.badRequest('Non-default zones must list at least one country.');
  }
  const created = await prisma.shippingZone.create({ data: body });
  if (created.isDefault) await ensureSingleDefaultZone(created.id);
  return created;
}

export async function adminUpdateZone(id: string, body: PartialZoneBody) {
  const existing = await prisma.shippingZone.findUnique({ where: { id } });
  if (!existing) throw HttpError.notFound('Zone not found');

  if (
    body.isDefault === false &&
    existing.isDefault &&
    (body.countries ?? existing.countries).length === 0
  ) {
    throw HttpError.badRequest(
      'Cannot un-default a zone that has no countries — add countries first or keep it as the default.',
    );
  }

  const updated = await prisma.shippingZone.update({ where: { id }, data: body });
  if (updated.isDefault) await ensureSingleDefaultZone(updated.id);
  return updated;
}

export async function adminDeleteZone(id: string): Promise<void> {
  // ShippingRate cascades on zone delete; orders keep their snapshot
  // (shippingCost is on the order itself), but the FK will go null.
  await prisma.shippingZone.delete({ where: { id } });
}

// ---------- Rates ----------

async function ensureZoneExists(zoneId: string): Promise<void> {
  const z = await prisma.shippingZone.findUnique({ where: { id: zoneId }, select: { id: true } });
  if (!z) throw HttpError.notFound('Zone not found');
}

async function ensureSingleDefaultRate(zoneId: string, currentRateId?: string) {
  await prisma.shippingRate.updateMany({
    where: {
      zoneId,
      isDefault: true,
      ...(currentRateId ? { NOT: { id: currentRateId } } : {}),
    },
    data: { isDefault: false },
  });
}

export async function adminListRates(zoneId: string) {
  await ensureZoneExists(zoneId);
  const items = await prisma.shippingRate.findMany({
    where: { zoneId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return { items };
}

export async function adminCreateRate(zoneId: string, body: UpsertRateBody) {
  await ensureZoneExists(zoneId);
  const created = await prisma.shippingRate.create({ data: { ...body, zoneId } });
  if (created.isDefault) await ensureSingleDefaultRate(zoneId, created.id);
  return created;
}

export async function adminUpdateRate(rateId: string, body: PartialRateBody) {
  const existing = await prisma.shippingRate.findUnique({ where: { id: rateId } });
  if (!existing) throw HttpError.notFound('Rate not found');
  const updated = await prisma.shippingRate.update({ where: { id: rateId }, data: body });
  if (updated.isDefault) await ensureSingleDefaultRate(existing.zoneId, updated.id);
  return updated;
}

export async function adminDeleteRate(rateId: string): Promise<void> {
  await prisma.shippingRate.delete({ where: { id: rateId } });
}
