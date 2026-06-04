import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '@/config/env';

/**
 * Delivery token — signed JWT bound to a single order.
 *
 * Issued when the order's status goes to OUT_FOR_DELIVERY. The
 * customer sees it twice on their phone:
 *   • as a QR code (encodes the full JWT)
 *   • as a 6-digit OTP (the last 6 chars of a SHA-256 of the JWT)
 *
 * Either is submitted to `/api/courier/confirm` by the rider; the
 * api re-derives the OTP from the JWT to handle the OTP-typed path.
 *
 * Single-use: after a successful confirm, the api flips the order
 * status to DELIVERED. Subsequent submissions with the same token
 * are rejected because the order is no longer in OUT_FOR_DELIVERY.
 * No separate revocation list needed.
 *
 * Lifetime: 24h. If a parcel doesn't reach the customer in 24h,
 * ops re-flips the status to re-issue a fresh token.
 */

const ISSUER = 'afrizonemart-courier';
const AUDIENCE = 'afrizonemart-courier';
const EXPIRES_IN = '24h';

export interface DeliveryTokenClaims {
  /// Subject — the order id we're confirming.
  sub: string;
  /// Customer's user id — used by the api confirm endpoint to log
  /// the delivery against the right user.
  uid: string;
}

export interface DeliveryToken {
  /// The signed JWT itself. Goes inside the QR.
  token: string;
  /// 6-digit OTP derived from the JWT. Same payload, easier to read
  /// aloud / type at the door.
  otp: string;
  /// ISO timestamp the token (and OTP) expire. Used by the mobile
  /// screen to show a friendly "expires at HH:MM" hint.
  expiresAt: string;
}

export function issueDeliveryToken(claims: DeliveryTokenClaims): DeliveryToken {
  const token = jwt.sign(claims, env.JWT_SECRET, {
    algorithm: 'HS256',
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: EXPIRES_IN,
  });
  const otp = otpFromToken(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return { token, otp, expiresAt };
}

/**
 * Verify a JWT presented by the rider. Returns the claims on
 * success, throws the JWT library's verification errors otherwise
 * (caller maps to HttpError).
 */
export function verifyDeliveryToken(token: string): DeliveryTokenClaims {
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: ISSUER,
    audience: AUDIENCE,
  }) as DeliveryTokenClaims;
  return decoded;
}

/**
 * Derive the 6-digit OTP from a JWT. Last 6 digits of the SHA-256
 * hex of the JWT, interpreted as a decimal mod 10^6. Deterministic
 * so the api can recompute from a stored token, and high-entropy
 * because the JWT itself is unguessable.
 */
export function otpFromToken(token: string): string {
  const h = createHash('sha256').update(token).digest('hex');
  /// Take the first 8 hex chars (32 bits), parse, mod 10^6, pad to 6
  /// digits. Plenty of entropy for a 24h-bound single-use code.
  const n = parseInt(h.slice(0, 8), 16) % 1_000_000;
  return n.toString().padStart(6, '0');
}
