import { createHmac, randomBytes } from 'node:crypto';
import { eventBus, type EventMap } from '@/infra/eventBus';
import { logger } from '@/infra/logger';
import { prisma } from '@/infra/prisma';

const KNOWN_EVENTS: (keyof EventMap)[] = [
  'order.placed',
  'order.paid',
  'order.shipped',
  'order.cancelled',
  'order.refunded',
  'order.note_added',
  'product.viewed',
  'cart.updated',
  'user.registered',
  'user.logged_in',
];

const MAX_ATTEMPTS = 3;
// Backoff between attempts (ms): 1m, 5m, 30m.
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000];
const WORKER_INTERVAL_MS = 30_000;

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString('hex')}`;
}

export function signPayload(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

interface DeliveryAttemptInput {
  webhookId: string;
  url: string;
  secret: string;
  eventType: string;
  payload: object;
}

interface DeliveryAttemptResult {
  ok: boolean;
  statusCode: number;
  responseBody: string | null;
}

async function attemptDelivery(input: DeliveryAttemptInput): Promise<DeliveryAttemptResult> {
  const body = JSON.stringify({
    event: input.eventType,
    payload: input.payload,
    sentAt: new Date().toISOString(),
  });
  const signature = signPayload(input.secret, body);
  let statusCode = 0;
  let responseBody: string | null = null;
  try {
    const res = await fetch(input.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Afrizonemart-Event': input.eventType,
        'X-Afrizonemart-Signature': `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    statusCode = res.status;
    try {
      responseBody = (await res.text()).slice(0, 4000);
    } catch {
      /* swallow */
    }
  } catch (err) {
    statusCode = 0;
    responseBody = err instanceof Error ? err.message : String(err);
  }
  return { ok: statusCode >= 200 && statusCode < 300, statusCode, responseBody };
}

/**
 * Find every active webhook subscribed to a given event (literal match
 * or '*' wildcard) and POST the payload to each. Records a
 * WebhookDelivery row per attempt; failures get queued for retry up to
 * MAX_ATTEMPTS times with exponential backoff.
 */
async function dispatch<K extends keyof EventMap>(
  eventType: K,
  payload: EventMap[K],
): Promise<void> {
  const subs = await prisma.webhook.findMany({ where: { isActive: true } });
  const matching = subs.filter(
    (w) => w.events.includes('*') || w.events.includes(eventType),
  );
  if (matching.length === 0) return;

  await Promise.all(
    matching.map(async (w) => {
      const result = await attemptDelivery({
        webhookId: w.id,
        url: w.url,
        secret: w.secret,
        eventType,
        payload: payload as object,
      });
      try {
        await prisma.webhookDelivery.create({
          data: {
            webhookId: w.id,
            eventType,
            payload: payload as object,
            statusCode: result.statusCode,
            responseBody: result.responseBody,
            attempts: 1,
            succeededAt: result.ok ? new Date() : null,
            failedAt: result.ok ? null : new Date(),
            nextAttemptAt: result.ok ? null : new Date(Date.now() + BACKOFF_MS[0]),
          },
        });
      } catch (err) {
        logger.error('webhook.delivery_log_failed', {
          webhookId: w.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );
}

/**
 * Replay a past delivery (admin trigger). Creates a NEW delivery row
 * with attempts reset to 1 and the original payload reused.
 */
export async function replayDelivery(deliveryId: string): Promise<void> {
  const orig = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhook: true },
  });
  if (!orig) throw new Error('Delivery not found');
  if (!orig.webhook.isActive) throw new Error('Webhook is inactive');

  const result = await attemptDelivery({
    webhookId: orig.webhookId,
    url: orig.webhook.url,
    secret: orig.webhook.secret,
    eventType: orig.eventType,
    payload: orig.payload as object,
  });
  await prisma.webhookDelivery.create({
    data: {
      webhookId: orig.webhookId,
      eventType: orig.eventType,
      payload: orig.payload as object,
      statusCode: result.statusCode,
      responseBody: result.responseBody,
      attempts: 1,
      succeededAt: result.ok ? new Date() : null,
      failedAt: result.ok ? null : new Date(),
      nextAttemptAt: result.ok ? null : new Date(Date.now() + BACKOFF_MS[0]),
    },
  });
}

/**
 * Background worker: every 30s, scan for failed deliveries due for
 * retry, attempt them, update the row in place. Runs forever; idempotent.
 */
async function processRetries(): Promise<void> {
  const due = await prisma.webhookDelivery.findMany({
    where: {
      succeededAt: null,
      nextAttemptAt: { lte: new Date() },
      attempts: { lt: MAX_ATTEMPTS },
    },
    include: { webhook: true },
    take: 50,
  });

  for (const d of due) {
    if (!d.webhook.isActive) continue;
    const result = await attemptDelivery({
      webhookId: d.webhookId,
      url: d.webhook.url,
      secret: d.webhook.secret,
      eventType: d.eventType,
      payload: d.payload as object,
    });
    const newAttempts = d.attempts + 1;
    const nextBackoff = BACKOFF_MS[newAttempts - 1];
    await prisma.webhookDelivery.update({
      where: { id: d.id },
      data: {
        statusCode: result.statusCode,
        responseBody: result.responseBody,
        attempts: newAttempts,
        succeededAt: result.ok ? new Date() : null,
        failedAt: result.ok ? null : new Date(),
        nextAttemptAt:
          result.ok || newAttempts >= MAX_ATTEMPTS
            ? null
            : new Date(Date.now() + (nextBackoff ?? BACKOFF_MS[BACKOFF_MS.length - 1])),
      },
    });
  }
}

let dispatcherStarted = false;
let workerHandle: NodeJS.Timeout | null = null;

/**
 * Wire the dispatcher into the in-process event bus + start the retry
 * worker. Idempotent. Call once at server start.
 */
export function startWebhookDispatcher(): void {
  if (dispatcherStarted) return;
  dispatcherStarted = true;
  for (const evt of KNOWN_EVENTS) {
    eventBus.on(evt, async (payload) => {
      await dispatch(evt, payload as never);
    });
  }
  workerHandle = setInterval(() => {
    processRetries().catch((err) =>
      logger.error('webhook.retry_worker_failed', {
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }, WORKER_INTERVAL_MS);
  logger.info('webhook.dispatcher_started', {
    events: KNOWN_EVENTS.length,
    retryWorkerMs: WORKER_INTERVAL_MS,
    maxAttempts: MAX_ATTEMPTS,
  });
}

export function stopWebhookDispatcher(): void {
  if (workerHandle) clearInterval(workerHandle);
  workerHandle = null;
  dispatcherStarted = false;
}
