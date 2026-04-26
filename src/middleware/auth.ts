import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '@/config/env';
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
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
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

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthUser & {
      iat?: number;
      exp?: number;
    };
    req.user = { id: payload.id, email: payload.email };
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
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET) as AuthUser;
    req.user = { id: payload.id, email: payload.email };
  } catch {
    // Silently ignore invalid token in optional mode
  }
  next();
}
