import type { NextFunction, Response } from 'express';
import type { AuthedRequest } from './auth';
import { HttpError } from './error-handler';

type Role = 'CUSTOMER' | 'SELLER' | 'ADMIN';

/**
 * Gate a route to one or more roles. Always pair with requireAuth so
 * `req.user` is populated by the time this runs.
 *
 *   router.use(requireAuth, requireRole('ADMIN'));
 *   router.use(requireAuth, requireRole('ADMIN', 'SELLER'));
 */
export function requireRole(...allowed: Role[]) {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) throw HttpError.unauthorized();
    if (!allowed.includes(req.user.role as Role)) {
      throw HttpError.forbidden(`This action requires role: ${allowed.join(' or ')}`);
    }
    next();
  };
}
