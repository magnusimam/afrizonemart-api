import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '@/config/env';

/**
 * JWT helpers for the Auth module.
 *
 * Two token types:
 *  - access  — short-lived (default 15m), sent in `Authorization: Bearer`
 *  - refresh — long-lived (default 30d), used to obtain a new access
 *
 * The refresh token's hash is also stored on the User row so we can revoke
 * a single session by clearing it. JWT_SECRET signs both — separation of
 * secrets can come later if we want to rotate access independently.
 */

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: string;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as SignOptions);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as SignOptions);
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as RefreshTokenPayload;
}
