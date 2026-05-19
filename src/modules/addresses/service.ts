import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import type { PartialAddressBody, UpsertAddressBody } from './schema';

/**
 * Saved customer delivery addresses. Used by `/account/addresses`
 * for management and (future) by `/checkout/shipping` to populate
 * the address picker.
 *
 * Default-exclusivity is enforced HERE in the service inside a
 * transaction (Postgres can't easily express
 * "unique-per-user-where-true" without a partial unique index, and
 * we don't want to fight the seed-data flow). On every write that
 * sets `isDefault: true`, we first flip every other address on this
 * user to false, then update the target — both in the same tx.
 */

export async function listAddresses(userId: string) {
  return prisma.userAddress.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function getAddress(userId: string, id: string) {
  const row = await prisma.userAddress.findUnique({ where: { id } });
  if (!row || row.userId !== userId) {
    // Returning 404 here for both "not yours" and "doesn't exist"
    // avoids leaking whether an address-id belongs to another user.
    throw HttpError.notFound('Address not found');
  }
  return row;
}

export async function createAddress(userId: string, body: UpsertAddressBody) {
  const existingCount = await prisma.userAddress.count({ where: { userId } });
  // First address a user creates is always default — saves a click on
  // the empty-state. Explicit `isDefault: false` on the body still
  // wins.
  const shouldBeDefault =
    body.isDefault === true || (body.isDefault === undefined && existingCount === 0);

  return prisma.$transaction(async (tx) => {
    if (shouldBeDefault) {
      await tx.userAddress.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.userAddress.create({
      data: {
        userId,
        fullName: body.fullName,
        phone: body.phone,
        addressLine: body.addressLine,
        city: body.city,
        country: body.country,
        label: body.label ?? null,
        isDefault: shouldBeDefault,
      },
    });
  });
}

export async function updateAddress(
  userId: string,
  id: string,
  body: PartialAddressBody,
) {
  // Verify ownership first so we never leak the existence of someone
  // else's address through an update conflict message.
  await getAddress(userId, id);

  return prisma.$transaction(async (tx) => {
    if (body.isDefault === true) {
      await tx.userAddress.updateMany({
        where: { userId, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }
    return tx.userAddress.update({
      where: { id },
      data: {
        ...(body.fullName !== undefined && { fullName: body.fullName }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.addressLine !== undefined && { addressLine: body.addressLine }),
        ...(body.city !== undefined && { city: body.city }),
        ...(body.country !== undefined && { country: body.country }),
        ...(body.label !== undefined && { label: body.label }),
        ...(body.isDefault !== undefined && { isDefault: body.isDefault }),
      },
    });
  });
}

/**
 * Tracker #52 (2026-05-19) — auto-save the shipping address used on
 * a freshly-placed order. Called from `placeOrder` AFTER the order
 * transaction commits (a failure here should never roll back a paid
 * order; the catch site logs + swallows).
 *
 * Behaviour:
 *  - First order for this user → create one address, marked default
 *    (the existing `createAddress` first-row logic handles this).
 *  - Subsequent order with a NEW address (no exact match) → save it
 *    but DON'T mark default — preserves the customer's chosen
 *    default. The list grows naturally on every order.
 *  - Subsequent order using an address that exactly matches an
 *    existing saved one → no-op. Avoids duplicating the saved list
 *    every time they reuse the same address.
 *
 * Match is exact on the lowercased + trimmed quintuple
 * (fullName, phone, addressLine, city, country). Fuzzy match isn't
 * worth it here — typos in two consecutive orders produce two list
 * entries, which the customer can clean up from /account/addresses.
 */
export async function autoSaveOrderAddress(
  userId: string,
  shipping: {
    fullName: string;
    phone: string;
    addressLine: string;
    city: string;
    country: string;
  },
): Promise<void> {
  const norm = (s: string) => s.trim().toLowerCase();
  const existing = await prisma.userAddress.findMany({
    where: { userId },
    select: {
      fullName: true,
      phone: true,
      addressLine: true,
      city: true,
      country: true,
    },
  });
  const target = {
    fullName: norm(shipping.fullName),
    phone: norm(shipping.phone),
    addressLine: norm(shipping.addressLine),
    city: norm(shipping.city),
    country: norm(shipping.country),
  };
  const duplicate = existing.some(
    (a) =>
      norm(a.fullName) === target.fullName &&
      norm(a.phone) === target.phone &&
      norm(a.addressLine) === target.addressLine &&
      norm(a.city) === target.city &&
      norm(a.country) === target.country,
  );
  if (duplicate) return;

  /// Pass isDefault: undefined so createAddress's first-row rule
  /// applies — only the first ever address auto-marks default;
  /// subsequent ones save without disturbing the existing default.
  await createAddress(userId, {
    fullName: shipping.fullName,
    phone: shipping.phone,
    addressLine: shipping.addressLine,
    city: shipping.city,
    country: shipping.country.toUpperCase(),
    label: null,
  });
}

export async function deleteAddress(userId: string, id: string) {
  // Verify ownership before deleting.
  const target = await getAddress(userId, id);

  await prisma.$transaction(async (tx) => {
    await tx.userAddress.delete({ where: { id } });
    // If we just deleted the default, promote the most-recently-edited
    // remaining address to default so the customer always has one.
    if (target.isDefault) {
      const next = await tx.userAddress.findFirst({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      });
      if (next) {
        await tx.userAddress.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
  });
}
