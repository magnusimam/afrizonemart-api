import { Router, type Request, type Response, type NextFunction } from 'express';
import { env } from '@/config/env';
import { asyncHandler } from '@/middleware/async-handler';
import { telegramWebhookHandler } from './controller';

/**
 * Inbound Telegram webhook route. Telegram delivers every update
 * (messages + button taps) to POST /api/telegram/webhook.
 *
 * Two-layer trust:
 *   1. `secret_token` — set on Telegram's side via setWebhook and
 *      echoed back in the X-Telegram-Bot-Api-Secret-Token header.
 *      We reject anything that doesn't match, so the public endpoint
 *      can't be driven by a random POST.
 *   2. The controller then gates command replies to the admin chat
 *      allow-list. Layer 1 stops noise; layer 2 stops data leaks.
 *
 * When TELEGRAM_WEBHOOK_SECRET is unset the endpoint 503s — the
 * interactive command surface is simply off (outbound alerts are
 * independent and unaffected).
 */
export const telegramRoutes = Router();

function verifySecret(req: Request, res: Response, next: NextFunction): void {
  const configured = env.TELEGRAM_WEBHOOK_SECRET;
  if (!configured) {
    res.status(503).json({ error: 'telegram_commands_disabled' });
    return;
  }
  const header = req.header('X-Telegram-Bot-Api-Secret-Token');
  if (header !== configured) {
    res.status(401).json({ error: 'bad_secret_token' });
    return;
  }
  next();
}

telegramRoutes.post('/webhook', verifySecret, asyncHandler(telegramWebhookHandler));
