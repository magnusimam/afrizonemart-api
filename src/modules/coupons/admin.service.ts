import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import type { PartialCouponBody, UpsertCouponBody } from './admin.schema';

function normaliseCode(code: string): string {
  return code.trim().toUpperCase();
}

function clampValuesForType(input: { type: UpsertCouponBody['type']; valuePercent?: number | null; valueAmount?: number | null }) {
  // Wipe the irrelevant value column for clarity (and so accidental
  // saves don't leave stale values from a prior type choice).
  if (input.type === 'PERCENT_CART') return { valuePercent: input.valuePercent ?? null, valueAmount: null };
  if (input.type === 'FIXED_CART') return { valuePercent: null, valueAmount: input.valueAmount ?? null };
  return { valuePercent: null, valueAmount: null };
}

export async function adminListCoupons() {
  const items = await prisma.coupon.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
  });
  return { items };
}

export async function adminGetCoupon(id: string) {
  const coupon = await prisma.coupon.findUnique({
    where: { id },
    include: { _count: { select: { redemptions: true } } },
  });
  if (!coupon) throw HttpError.notFound('Coupon not found');
  return coupon;
}

export async function adminCreateCoupon(body: UpsertCouponBody) {
  const code = normaliseCode(body.code);
  const existing = await prisma.coupon.findUnique({ where: { code }, select: { id: true } });
  if (existing) throw HttpError.conflict(`Code "${code}" already exists`);

  const { valuePercent, valueAmount } = clampValuesForType(body);

  return prisma.coupon.create({
    data: {
      code,
      description: body.description ?? null,
      type: body.type,
      valuePercent,
      valueAmount,
      minSubtotal: body.minSubtotal ?? null,
      maxUses: body.maxUses ?? null,
      maxUsesPerCustomer: body.maxUsesPerCustomer ?? null,
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      isActive: body.isActive,
    },
  });
}

export async function adminUpdateCoupon(id: string, body: PartialCouponBody) {
  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) throw HttpError.notFound('Coupon not found');

  const nextType = body.type ?? existing.type;
  const { valuePercent, valueAmount } = clampValuesForType({
    type: nextType,
    valuePercent: body.valuePercent ?? existing.valuePercent,
    valueAmount: body.valueAmount ?? existing.valueAmount,
  });

  return prisma.coupon.update({
    where: { id },
    data: {
      ...(body.description !== undefined && { description: body.description ?? null }),
      ...(body.type !== undefined && { type: body.type }),
      valuePercent,
      valueAmount,
      ...(body.minSubtotal !== undefined && { minSubtotal: body.minSubtotal ?? null }),
      ...(body.maxUses !== undefined && { maxUses: body.maxUses ?? null }),
      ...(body.maxUsesPerCustomer !== undefined && {
        maxUsesPerCustomer: body.maxUsesPerCustomer ?? null,
      }),
      ...(body.startsAt !== undefined && {
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
      }),
      ...(body.endsAt !== undefined && {
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
      }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  });
}

export async function adminDeleteCoupon(id: string): Promise<void> {
  const used = await prisma.couponRedemption.findFirst({ where: { couponId: id }, select: { id: true } });
  if (used) {
    throw HttpError.conflict(
      'Cannot delete a coupon with redemptions on file. Deactivate it instead.',
    );
  }
  await prisma.coupon.delete({ where: { id } });
}
