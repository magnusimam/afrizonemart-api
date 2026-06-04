import type { Request, Response } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '@/middleware/auth';
import { HttpError } from '@/middleware/error-handler';
import {
  confirmDeliveryAsCustomer,
  confirmDeliveryFromCourier,
  getDeliveryTokenForCustomer,
} from './service';

function userIdOr401(req: AuthedRequest): string {
  if (!req.user) throw HttpError.unauthorized();
  return req.user.id;
}

/**
 * GET /api/orders/:id/delivery-token — customer fetches their
 * order's active QR/OTP. Returns 200 with the payload when the
 * order is in OUT_FOR_DELIVERY; 200 with `null` when it isn't (so
 * the client can poll without bouncing on 404s).
 */
export async function getDeliveryTokenHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const userId = userIdOr401(req);
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing order id');
  const payload = await getDeliveryTokenForCustomer(userId, id);
  res.json(payload ?? null);
}

/**
 * POST /api/orders/:id/confirm-delivery — customer self-confirms.
 * No body. Caller is the customer (authed).
 */
export async function confirmDeliveryByCustomerHandler(
  req: AuthedRequest,
  res: Response,
): Promise<void> {
  const userId = userIdOr401(req);
  const id = req.params.id;
  if (!id) throw HttpError.badRequest('Missing order id');
  const r = await confirmDeliveryAsCustomer(userId, id);
  res.json(r);
}

const courierConfirmSchema = z
  .object({
    token: z.string().min(8).max(2000).optional(),
    otp: z.string().min(4).max(8).optional(),
    courierNote: z.string().max(1000).optional(),
  })
  .refine((v) => v.token || v.otp, {
    message: 'Provide either token or otp',
    path: ['token'],
  });

/**
 * POST /api/courier/confirm — public. Rider scans the customer's
 * QR (token) OR types the 6-digit OTP (otp). The service rejects
 * malformed input + replays.
 *
 * Logs the rider's IP + UA into the OrderEvent payload so ops has
 * a fraud trail. No rider auth — the URL is a bookmarked link the
 * rider uses for every delivery (cf. project scope decision).
 */
export async function courierConfirmHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const parse = courierConfirmSchema.safeParse(req.body);
  if (!parse.success) {
    throw HttpError.badRequest(parse.error.issues[0]?.message ?? 'Bad request');
  }
  const r = await confirmDeliveryFromCourier(parse.data, {
    ip:
      (req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ?? null) ||
      req.ip ||
      null,
    userAgent: req.headers['user-agent']?.toString() ?? null,
  });
  res.json(r);
}
