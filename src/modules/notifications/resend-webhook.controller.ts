import type { Request, Response } from 'express';
import { logger } from '@/infra/logger';
import {
  WebhookVerificationError,
  ingestResendEvent,
} from './resend-webhook.service';

/**
 * Tracker #49 — POST /api/webhooks/resend. Public endpoint; signature
 * verification inside `ingestResendEvent` is the only auth.
 *
 * Failure mode policy:
 *   - Bad signature / missing headers → 400 (Resend won't retry)
 *   - Body is unparseable JSON          → 400
 *   - Already processed (replay)        → 200 (idempotent ack)
 *   - Unhandled event type              → 200 ignored
 *   - Anything else                     → 500 (Resend retries)
 */
export async function resendWebhookHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const raw = (req as { rawBody?: Buffer }).rawBody;
  const rawBody = raw ? raw.toString('utf8') : JSON.stringify(req.body);

  const headers = {
    svixId: String(req.headers['svix-id'] ?? ''),
    svixTimestamp: String(req.headers['svix-timestamp'] ?? ''),
    svixSignature: String(req.headers['svix-signature'] ?? ''),
  };
  if (!headers.svixId || !headers.svixTimestamp || !headers.svixSignature) {
    logger.warn('resend.webhook.missing_headers');
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Missing svix-* signature headers.' },
    });
    return;
  }

  try {
    const result = await ingestResendEvent(rawBody, headers);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      logger.warn('resend.webhook.verify_failed', { error: err.message });
      res.status(400).json({
        error: { code: 'BAD_REQUEST', message: err.message },
      });
      return;
    }
    logger.error('resend.webhook.unhandled', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
