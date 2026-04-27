import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncHandler<R extends Request = Request> = (
  req: R,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/**
 * Express 4 does not catch errors thrown by async route handlers — they
 * bubble up as unhandled promise rejections and (under Node 20+) crash
 * the process. Wrap every async handler with this helper so any thrown
 * error is forwarded to the central errorHandler instead.
 */
export function asyncHandler<R extends Request = Request>(
  fn: AsyncHandler<R>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as R, res, next)).catch(next);
  };
}
