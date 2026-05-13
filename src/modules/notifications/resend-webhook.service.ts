import { createHmac, timingSafeEqual } from 'node:crypto';
import type { EmailEventType, Prisma } from '@prisma/client';
import { env } from '@/config/env';
import { logger } from '@/infra/logger';
import { prisma } from '@/infra/prisma';

/**
 * Tracker #49 — Resend webhook ingest.
 *
 * Resend signs webhooks Svix-style. Three headers:
 *   - svix-id          — unique delivery id
 *   - svix-timestamp   — unix timestamp (seconds)
 *   - svix-signature   — "v1,<base64-hmac>" optionally space-separated
 *                         with rotated keys
 *
 * Signature payload is `${svixId}.${svixTimestamp}.${rawBody}` HMAC-SHA256
 * with the webhook signing secret as the key. Constant-time compare so
 * a brute-forcer can't probe by timing.
 */

const TOLERANCE_SECONDS = 5 * 60;

export interface ResendHeaders {
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
}

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}

/// Resend's secrets are prefixed with `whsec_` followed by a base64
/// string. We strip the prefix before using it as the HMAC key. If
/// the secret was set without the prefix (e.g. raw base64) we use it
/// as-is.
function decodeSecret(raw: string): Buffer {
  const stripped = raw.startsWith('whsec_') ? raw.slice('whsec_'.length) : raw;
  // Resend's secrets are base64-encoded by default. If decoding fails
  // we fall back to treating the secret as a raw UTF-8 string so
  // self-rotated / non-standard secrets still work.
  try {
    return Buffer.from(stripped, 'base64');
  } catch {
    return Buffer.from(stripped, 'utf8');
  }
}

export function verifyResendSignature(
  rawBody: string,
  headers: ResendHeaders,
): void {
  if (!env.RESEND_WEBHOOK_SECRET) {
    throw new WebhookVerificationError(
      'RESEND_WEBHOOK_SECRET is not configured.',
    );
  }
  const tsSeconds = Number(headers.svixTimestamp);
  if (!Number.isFinite(tsSeconds)) {
    throw new WebhookVerificationError('Bad svix-timestamp header.');
  }
  /// Tolerance window — Resend rejects deliveries older than ~5 min
  /// in their own client; we do the same. Protects against an
  /// attacker replaying a captured signed body weeks later.
  const ageSeconds = Math.abs(Date.now() / 1000 - tsSeconds);
  if (ageSeconds > TOLERANCE_SECONDS) {
    throw new WebhookVerificationError(
      `Timestamp ${tsSeconds} is outside the ${TOLERANCE_SECONDS}s window.`,
    );
  }

  const secret = decodeSecret(env.RESEND_WEBHOOK_SECRET);
  const payload = `${headers.svixId}.${headers.svixTimestamp}.${rawBody}`;
  const expected = createHmac('sha256', secret).update(payload).digest('base64');

  /// The header is `v1,<sig> v1,<sig> …` — multiple sigs separated
  /// by spaces for key rotation. Any match wins.
  const sigList = headers.svixSignature.split(' ');
  for (const candidate of sigList) {
    const parts = candidate.split(',');
    if (parts.length !== 2 || parts[0] !== 'v1') continue;
    const given = Buffer.from(parts[1]);
    const expectedBuf = Buffer.from(expected);
    if (
      given.length === expectedBuf.length &&
      timingSafeEqual(given, expectedBuf)
    ) {
      return;
    }
  }
  throw new WebhookVerificationError('No matching signature.');
}

interface ResendPayload {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    click?: { link?: string; timestamp?: string };
    bounce?: { type?: string; message?: string };
    [k: string]: unknown;
  };
}

const TYPE_MAP: Record<string, EmailEventType> = {
  'email.sent': 'SENT',
  'email.delivered': 'DELIVERED',
  'email.delivery_delayed': 'DELIVERY_DELAYED',
  'email.opened': 'OPENED',
  'email.clicked': 'CLICKED',
  'email.bounced': 'BOUNCED',
  'email.complained': 'COMPLAINED',
};

export interface IngestResult {
  ignored?: boolean;
  reason?: string;
  eventId?: string;
}

export async function ingestResendEvent(
  rawBody: string,
  headers: ResendHeaders,
): Promise<IngestResult> {
  verifyResendSignature(rawBody, headers);

  let payload: ResendPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new WebhookVerificationError('Body is not valid JSON.');
  }

  const type = TYPE_MAP[payload.type];
  if (!type) {
    logger.info('resend.webhook.ignored_type', { type: payload.type });
    return { ignored: true, reason: `Unhandled type: ${payload.type}` };
  }

  const messageId = payload.data?.email_id;
  if (!messageId) {
    return { ignored: true, reason: 'No email_id in payload.' };
  }
  const occurredAt = payload.created_at
    ? new Date(payload.created_at)
    : new Date();

  /// Tracker #49 — replay guard. Resend retries on 5xx so the same
  /// event id can arrive twice. The svix-id header is the unique
  /// delivery id; we use it as the InboundWebhookEvent bodyHash so
  /// the existing replay table (originally built for payment
  /// webhooks) does double duty.
  const replayBodyHash = headers.svixId;

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.inboundWebhookEvent.create({
        data: {
          provider: 'resend',
          bodyHash: replayBodyHash,
          outcome: type,
        },
      });

      const notification = await tx.notification.findFirst({
        where: { providerMessageId: messageId },
        select: { id: true },
      });

      const clickedUrl = payload.data?.click?.link ?? null;
      const bounceType = payload.data?.bounce?.type ?? null;
      const bounceReason = payload.data?.bounce?.message ?? null;

      const event = await tx.emailEvent.create({
        data: {
          notificationId: notification?.id ?? null,
          providerMessageId: messageId,
          type,
          occurredAt,
          clickedUrl,
          bounceType,
          bounceReason,
          rawPayload: payload as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });

      /// Update Notification denorm summary. We do this BEFORE
      /// hitting the bus / any side-effects so the admin list
      /// reflects the new state immediately.
      if (notification) {
        const data: Prisma.NotificationUpdateInput = {};
        if (type === 'DELIVERED') {
          data.deliveredAt = occurredAt;
        }
        if (type === 'OPENED') {
          data.firstOpenedAt = { set: undefined };
          data.lastOpenedAt = occurredAt;
          data.openCount = { increment: 1 };
        }
        if (type === 'CLICKED') {
          data.lastClickedAt = occurredAt;
          data.clickCount = { increment: 1 };
        }
        if (type === 'BOUNCED') {
          data.bouncedAt = occurredAt;
          data.bounceReason = bounceReason;
          data.status = 'FAILED';
        }
        if (type === 'COMPLAINED') {
          data.complainedAt = occurredAt;
        }
        await tx.notification.update({
          where: { id: notification.id },
          data,
        });

        /// First-open uses a separate touch because we want to set
        /// the column only on the first event, not every event.
        if (type === 'OPENED') {
          await tx.notification.updateMany({
            where: { id: notification.id, firstOpenedAt: null },
            data: { firstOpenedAt: occurredAt },
          });
        }
        if (type === 'CLICKED') {
          await tx.notification.updateMany({
            where: { id: notification.id, firstClickedAt: null },
            data: { firstClickedAt: occurredAt },
          });
        }
      } else {
        logger.warn('resend.webhook.no_matching_notification', {
          messageId,
          type,
        });
      }

      return { eventId: event.id };
    });
  } catch (err) {
    /// P2002 = unique index trip = replay. Ack with 200 so Resend
    /// doesn't keep retrying.
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      logger.info('resend.webhook.replay_blocked', { svixId: headers.svixId });
      return { ignored: true, reason: 'Already processed.' };
    }
    throw err;
  }
}
