import type { OrderStatus, Prisma } from '@prisma/client';
import { eventBus } from '@/infra/eventBus';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { logAudit } from '@/modules/audit/service';
import { issueOrRefreshDeliveryToken } from '@/modules/courier/service';
import type {
  AddNoteBody,
  AdminOrderListQuery,
  RecordRefundBody,
  UpdateStatusBody,
} from './admin.schema';

/**
 * Allowed status transitions. Anything else returns 400.
 * Mirrors the natural fulfilment flow but allows CANCELLED at any point
 * before SHIPPED, and REFUNDED at any point after PAID.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID: ['FULFILLING', 'CANCELLED', 'REFUNDED'],
  FULFILLING: ['SHIPPED', 'CANCELLED', 'REFUNDED'],
  /// SHIPPED → OUT_FOR_DELIVERY (new) is the canonical path for
  /// Show & Scan. SHIPPED → DELIVERED stays valid so admins can
  /// short-circuit on small / next-day deliveries that skip the
  /// out-for-delivery hand-off.
  SHIPPED: ['OUT_FOR_DELIVERY', 'DELIVERED', 'REFUNDED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'SHIPPED', 'REFUNDED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

export async function adminListOrders(query: AdminOrderListQuery) {
  const where: Prisma.OrderWhereInput = {};
  if (query.status) where.status = query.status;
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = new Date(query.from);
    if (query.to) where.createdAt.lte = new Date(query.to);
  }
  if (query.q) {
    where.OR = [
      { orderNumber: { contains: query.q, mode: 'insensitive' } },
      { user: { email: { contains: query.q, mode: 'insensitive' } } },
      { user: { name: { contains: query.q, mode: 'insensitive' } } },
      { shipFullName: { contains: query.q, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        user: { select: { id: true, email: true, name: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function adminGetOrder(id: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
      user: { select: { id: true, email: true, name: true, role: true, createdAt: true } },
      events: { orderBy: { createdAt: 'desc' } },
      refunds: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!order) throw HttpError.notFound('Order not found');
  return order;
}

export async function adminUpdateStatus(
  id: string,
  body: UpdateStatusBody,
  actorUserId: string,
) {
  const existing = await prisma.order.findUnique({
    where: { id },
    select: { id: true, status: true, userId: true, total: true },
  });
  if (!existing) throw HttpError.notFound('Order not found');

  if (existing.status === body.status) {
    throw HttpError.badRequest(`Order is already ${body.status}`);
  }
  const allowed = ALLOWED_TRANSITIONS[existing.status];
  if (!allowed.includes(body.status)) {
    throw HttpError.badRequest(
      `Cannot move from ${existing.status} to ${body.status}. Allowed: ${allowed.join(', ') || 'none — terminal status'}.`,
    );
  }

  const cancelled = body.status === 'CANCELLED';
  const updated = await prisma.$transaction(async (tx) => {
    const order = await tx.order.update({
      where: { id },
      data: {
        status: body.status,
        ...(cancelled && { cancelledAt: new Date() }),
      },
    });
    await tx.orderEvent.create({
      data: {
        orderId: id,
        type: cancelled ? 'CANCELLED' : 'STATUS_CHANGED',
        payload: {
          from: existing.status,
          to: body.status,
          ...(body.note ? { note: body.note } : {}),
        } as Prisma.InputJsonValue,
        actorUserId,
        isCustomerVisible: true,
      },
    });
    return order;
  });

  if (cancelled) {
    await eventBus.emit('order.cancelled', {
      orderId: id,
      userId: existing.userId,
      reason: body.note,
    });
  } else if (body.status === 'SHIPPED') {
    await eventBus.emit('order.shipped', {
      orderId: id,
      userId: existing.userId,
    });
  } else if (body.status === 'OUT_FOR_DELIVERY') {
    /// Mint the delivery JWT + OTP now so the customer's QR can be
    /// rendered as soon as their next refresh.
    await issueOrRefreshDeliveryToken(id, existing.userId);
    await eventBus.emit('order.out_for_delivery', {
      orderId: id,
      userId: existing.userId,
    });
  } else if (body.status === 'DELIVERED') {
    await eventBus.emit('order.delivered', {
      orderId: id,
      userId: existing.userId,
      source: 'admin',
    });
  } else if (
    /// Tracker #47 — when admin manually flips a PENDING_PAYMENT
    /// order to PAID (e.g. after confirming a bank transfer landed
    /// or COD was collected by the courier), fire the same
    /// `order.paid` event the gateway webhook would fire. Single
    /// trigger → same OrderConfirmed + PaymentReceived emails →
    /// same fulfilment + loyalty downstream. Avoids a forked
    /// "admin-marked PAID" pathway that drifts from the canonical
    /// one over time.
    body.status === 'PAID' &&
    existing.status === 'PENDING_PAYMENT'
  ) {
    /// Find the most recent payment row for this order so the event
    /// carries a paymentId (callers like loyalty + refund clawback
    /// expect it). For COD orders there may be no Payment row, in
    /// which case we skip the paymentId; subscribers tolerate this.
    const latestPayment = await prisma.payment.findFirst({
      where: { orderId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, gateway: true },
    });
    await eventBus.emit('order.paid', {
      orderId: id,
      paymentId: latestPayment?.id ?? '',
      method: latestPayment?.gateway ?? 'manual',
      source: 'admin',
    });
  }

  await logAudit({
    actorUserId,
    entityType: 'order',
    entityId: id,
    action: 'order.status_changed',
    changes: { from: existing.status, to: body.status, note: body.note },
  });

  return updated;
}

export async function adminAddNote(
  id: string,
  body: AddNoteBody,
  actorUserId: string,
) {
  const existing = await prisma.order.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!existing) throw HttpError.notFound('Order not found');

  const event = await prisma.orderEvent.create({
    data: {
      orderId: id,
      type: 'NOTE',
      payload: { text: body.text } as Prisma.InputJsonValue,
      actorUserId,
      isCustomerVisible: body.isCustomerVisible,
    },
  });

  await eventBus.emit('order.note_added', {
    orderId: id,
    userId: existing.userId,
    isCustomerVisible: body.isCustomerVisible,
  });

  return event;
}

export async function adminRecordRefund(
  id: string,
  body: RecordRefundBody,
  actorUserId: string,
) {
  const existing = await prisma.order.findUnique({
    where: { id },
    select: { id: true, total: true, refundedTotal: true, userId: true, status: true },
  });
  if (!existing) throw HttpError.notFound('Order not found');

  if (existing.status === 'PENDING_PAYMENT') {
    throw HttpError.badRequest(
      'Cannot refund an unpaid order — cancel it instead.',
    );
  }

  const remaining = existing.total - existing.refundedTotal;
  if (body.amount > remaining) {
    throw HttpError.badRequest(
      `Refund of ${body.amount} exceeds remaining refundable amount ${remaining}.`,
    );
  }

  const newRefundedTotal = existing.refundedTotal + body.amount;
  const fullyRefunded = newRefundedTotal >= existing.total;

  const refund = await prisma.$transaction(async (tx) => {
    const created = await tx.refund.create({
      data: {
        orderId: id,
        amount: body.amount,
        reason: body.reason ?? null,
        createdByUserId: actorUserId,
      },
    });
    await tx.order.update({
      where: { id },
      data: {
        refundedTotal: newRefundedTotal,
        ...(fullyRefunded && { status: 'REFUNDED' }),
      },
    });
    await tx.orderEvent.create({
      data: {
        orderId: id,
        type: 'REFUND_RECORDED',
        payload: {
          amount: body.amount,
          reason: body.reason ?? null,
          fullyRefunded,
        } as Prisma.InputJsonValue,
        actorUserId,
        isCustomerVisible: true,
      },
    });
    return created;
  });

  await eventBus.emit('order.refunded', {
    orderId: id,
    userId: existing.userId,
    amount: body.amount,
    reason: body.reason,
  });

  await logAudit({
    actorUserId,
    entityType: 'order',
    entityId: id,
    action: 'order.refund_recorded',
    changes: { amount: body.amount, reason: body.reason, fullyRefunded },
  });

  return refund;
}
