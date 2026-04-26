import type { Request, Response, NextFunction } from 'express';
import { logger } from '@/infra/logger';

/**
 * Per-request structured logger (Principle #10 / Rule B10 — Observability).
 *
 * Logs method, path, status, duration_ms, and user-agent for every request.
 * Adds a `req.id` for trace correlation.
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = Date.now();
  const requestId =
    (req.headers['x-request-id'] as string | undefined) ??
    Math.random().toString(36).slice(2, 12);

  // Attach to request for downstream handlers
  (req as Request & { id: string }).id = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('http.request', {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: duration,
      userAgent: req.headers['user-agent'],
    });
  });

  next();
}
