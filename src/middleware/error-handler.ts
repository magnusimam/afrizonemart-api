import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Sentry } from '@/infra/sentry';
import { logger } from '@/infra/logger';

/**
 * Centralised error handler (Rule B8 — Error & Loading States, server side).
 *
 * Every API error funnels through here so the client always gets a
 * consistent JSON shape:
 *   { "error": { "code": "...", "message": "...", "details"?: ... } }
 */
export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new HttpError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Unauthorized') {
    return new HttpError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'Forbidden') {
    return new HttpError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Not found') {
    return new HttpError(404, 'NOT_FOUND', message);
  }
  static conflict(message: string) {
    return new HttpError(409, 'CONFLICT', message);
  }
  static internal(message = 'Internal server error') {
    return new HttpError(500, 'INTERNAL_SERVER_ERROR', message);
  }
}

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
};

export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: err.flatten().fieldErrors,
      },
    });
    return;
  }

  if (err instanceof HttpError) {
    logger.warn('http.error', {
      method: req.method,
      path: req.path,
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
    });
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // Unknown error — capture in Sentry, log, return 500
  Sentry.captureException(err);
  logger.error('http.unhandled_error', {
    method: req.method,
    path: req.path,
    error: err.message,
    stack: err.stack,
  });
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Something went wrong on our end. We have been notified.',
    },
  });
};
