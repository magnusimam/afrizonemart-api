import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import type {
  PartialWebhookBody,
  UpsertWebhookBody,
} from './admin.schema';
import { generateWebhookSecret, replayDelivery } from './dispatcher';

export async function adminListWebhooks() {
  const items = await prisma.webhook.findMany({
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    include: { _count: { select: { deliveries: true } } },
  });
  return { items };
}

export async function adminGetWebhook(id: string) {
  const w = await prisma.webhook.findUnique({
    where: { id },
    include: { _count: { select: { deliveries: true } } },
  });
  if (!w) throw HttpError.notFound('Webhook not found');
  return w;
}

export async function adminCreateWebhook(body: UpsertWebhookBody) {
  return prisma.webhook.create({
    data: { ...body, secret: generateWebhookSecret() },
  });
}

export async function adminUpdateWebhook(id: string, body: PartialWebhookBody) {
  const existing = await prisma.webhook.findUnique({ where: { id } });
  if (!existing) throw HttpError.notFound('Webhook not found');
  return prisma.webhook.update({ where: { id }, data: body });
}

export async function adminDeleteWebhook(id: string): Promise<void> {
  await prisma.webhook.delete({ where: { id } });
}

export async function adminListDeliveries(webhookId: string) {
  await adminGetWebhook(webhookId); // 404 if missing
  const items = await prisma.webhookDelivery.findMany({
    where: { webhookId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return { items };
}

export async function adminReplayDelivery(webhookId: string, deliveryId: string) {
  const orig = await prisma.webhookDelivery.findFirst({
    where: { id: deliveryId, webhookId },
  });
  if (!orig) throw HttpError.notFound('Delivery not found');
  await replayDelivery(deliveryId);
  return { ok: true };
}

export async function adminRotateSecret(webhookId: string) {
  const existing = await prisma.webhook.findUnique({ where: { id: webhookId } });
  if (!existing) throw HttpError.notFound('Webhook not found');
  return prisma.webhook.update({
    where: { id: webhookId },
    data: { secret: generateWebhookSecret() },
  });
}
