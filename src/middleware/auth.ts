import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '@/config/env';
import { VERIFY_OPTIONS } from '@/modules/auth/jwt';
import { HttpError } from './error-handler';

/**
 * JWT auth middleware (stub — full auth module lands later).
 *
 * Reads `Authorization: Bearer <token>`, verifies with JWT_SECRET, and
 * attaches `req.user` for downstream handlers. Throws 401 if missing/invalid.
 */
export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

interface AccessTokenClaims {
  sub: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

function userFromToken(token: string): AuthUser {
  // Phase 11.3 (audit H6): pin algorithm + iss + aud — VERIFY_OPTIONS
  // is the single source of truth shared with auth/jwt.ts so a future
  // change in one place can't drift here.
  const claims = jwt.verify(token, env.JWT_SECRET, VERIFY_OPTIONS) as AccessTokenClaims;
  return { id: claims.sub, email: claims.email, role: claims.role };
}

export function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw HttpError.unauthorized('Missing Authorization header');
  }

  try {
    req.user = userFromToken(header.slice(7));
    next();
  } catch {
    throw HttpError.unauthorized('Invalid or expired token');
  }
}

export function optionalAuth(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next();
    return;
  }

  try {
    req.user = userFromToken(header.slice(7));
  } catch {
    // Silently ignore invalid token in optional mode
  }
  next();
}
