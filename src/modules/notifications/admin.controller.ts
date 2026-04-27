import type { Request, Response } from 'express';
import { NotificationStatus, type Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { sendEmail } from './service';
import { renderEmail } from './render';
import { OrderConfirmedEmail } from './templates/OrderConfirmed';

const listQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  status: z.nativeEnum(NotificationStatus).optional(),
  type: z.string().optional(),
  q: z.string().optional(),
});

export async function adminListNotificationsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const q = listQuery.parse(req.query);
  const where: Prisma.NotificationWhereInput = {};
  if (q.status) where.status = q.status;
  if (q.type) where.type = q.type;
  if (q.q) {
    where.OR = [
      { recipient: { contains: q.q, mode: 'insensitive' } },
      { subject: { contains: q.q, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    }),
    prisma.notification.count({ where }),
  ]);

  res.json({
    items,
    pagination: {
      page: q.page,
      limit: q.limit,
      total,
      pages: Math.max(1, Math.ceil(total / q.limit)),
    },
  });
}

export async function adminGetNotificationHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  const n = await prisma.notification.findUnique({ where: { id } });
  if (!n) throw HttpError.notFound('Notification not found');

  // Re-render the HTML so the admin can preview what was sent. We use the
  // stored context — if a template signature has drifted since the original
  // send, the preview may fall back to the placeholder template.
  let previewHtml: string | null = null;
  try {
    const ctx = (n.context ?? {}) as Record<string, unknown>;
    if (n.type === 'order.confirmed') {
      const rendered = await renderEmail(
        OrderConfirmedEmail({
          customerName: 'Customer',
          orderNumber: String(ctx.orderNumber ?? ''),
          orderId: String(ctx.orderId ?? ''),
          placedAt: new Date(n.createdAt).toLocaleString(),
          total: 0,
          items: [],
          shippingAddress: { line1: '—', city: '—', region: '—', country: '—' },
          estimatedDelivery: '—',
          trackUrl: '#',
        }),
      );
      previewHtml = rendered.html;
    }
  } catch {
    /* preview is best-effort */
  }

  res.json({ ...n, previewHtml });
}

const resendBody = z.object({
  to: z.string().email().optional(),
});

/**
 * Resends a notification. If `to` is provided, the message goes to that
 * address (handy for testing); otherwise it goes to the original
 * recipient. Always creates a new Notification row — the original is
 * preserved for audit.
 */
export async function adminResendNotificationHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id;
  const body = resendBody.parse(req.body ?? {});
  const original = await prisma.notification.findUnique({ where: { id } });
  if (!original) throw HttpError.notFound('Notification not found');

  await sendEmail({
    type: `${original.type}.resend`,
    to: body.to ?? original.recipient,
    subject: original.subject ?? `(resend) ${original.type}`,
    userId: original.userId,
    context: original.context as Prisma.InputJsonValue,
    // Resends use a minimal "manual resend" template so we don't need to
    // perfectly reconstruct every original template's props. The original
    // remains in the log as the canonical record.
    template: OrderConfirmedEmail({
      customerName: 'Customer',
      orderNumber: String((original.context as Record<string, unknown>)?.orderNumber ?? ''),
      orderId: String((original.context as Record<string, unknown>)?.orderId ?? ''),
      placedAt: new Date(original.createdAt).toLocaleString(),
      total: 0,
      items: [],
      shippingAddress: { line1: '—', city: '—', region: '—', country: '—' },
      estimatedDelivery: '—',
      trackUrl: '#',
    }),
  });

  res.status(202).json({ ok: true });
}
