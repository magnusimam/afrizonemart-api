import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '@/infra/prisma';
import { HttpError } from './error-handler';

/**
 * Bearer auth for machine consumers of the API (B.I.L.L.I.E., and any
 * future service integration).
 *
 * These callers can't do the browser auth dance — the access token lives
 * 15 minutes and refresh rides an httpOnly cookie. So instead of a user
 * session they present a long-lived, revocable service token:
 *
 *   Authorization: Bearer azm_sk_<40 hex chars>
 *
 * Only the SHA-256 hash is stored, so the DB never holds a usable
 * credential. Scopes are explicit, and `readOnly` tokens are refused any
 * non-GET request before the route ever runs.
 */

export const SERVICE_TOKEN_PREFIX = 'azm_sk_';

export interface ServiceCaller {
  id: string;
  name: string;
  scopes: string[];
  readOnly: boolean;
}

export interface ServiceRequest extends Request {
  service?: ServiceCaller;
}

/** Tokens are compared by hash — never by the plaintext value. */
export function hashServiceToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Generate a fresh token. Returned once, at creation, then discarded. */
export function generateServiceToken(): string {
  return SERVICE_TOKEN_PREFIX + crypto.randomBytes(20).toString('hex');
}

/** Don't write to the DB on every single request — once a minute is plenty. */
const LAST_USED_THROTTLE_MS = 60_000;
const lastTouched = new Map<string, number>();

/**
 * Require a valid service token carrying every one of `needed` scopes.
 *
 *   router.use(requireServiceToken('suppliers.read'));
 */
export function requireServiceToken(...needed: string[]) {
  // Express 4 does not catch rejections from async middleware, so every
  // failure path here has to reach `next(err)` explicitly — otherwise the
  // request hangs and surfaces as an unhandled rejection instead of a 401.
  return (req: ServiceRequest, _res: Response, next: NextFunction): void => {
    void authenticate(req, needed).then(
      () => next(),
      (err) => next(err),
    );
  };
}

async function authenticate(req: ServiceRequest, needed: string[]): Promise<void> {
  const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw HttpError.unauthorized('Missing Authorization header');
    }

    const presented = header.slice(7).trim();
    if (!presented.startsWith(SERVICE_TOKEN_PREFIX)) {
      throw HttpError.unauthorized('Not a service token');
    }

    const record = await prisma.serviceToken.findUnique({
      where: { tokenHash: hashServiceToken(presented) },
    });

    if (!record || record.revokedAt) {
      throw HttpError.unauthorized('Invalid or revoked service token');
    }
    if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) {
      throw HttpError.unauthorized('Service token has expired');
    }

    // A read-only credential can never mutate, whatever the route allows.
    if (record.readOnly && req.method !== 'GET' && req.method !== 'HEAD') {
      throw HttpError.forbidden('This token is read-only');
    }

    const missing = needed.filter((scope) => !record.scopes.includes(scope));
    if (missing.length > 0) {
      throw HttpError.forbidden(`Missing required scope${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`);
    }

    req.service = {
      id: record.id,
      name: record.name,
      scopes: record.scopes,
      readOnly: record.readOnly,
    };

    const now = Date.now();
    const seen = lastTouched.get(record.id) ?? 0;
    if (now - seen > LAST_USED_THROTTLE_MS) {
      lastTouched.set(record.id, now);
      // Best-effort telemetry — must never fail the request.
      void prisma.serviceToken
        .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
        .catch(() => undefined);
  }
}
