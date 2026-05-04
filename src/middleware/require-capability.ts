import type { NextFunction, Response } from 'express';
import type { AuthedRequest } from './auth';
import { prisma } from '@/infra/prisma';
import { HttpError } from './error-handler';
import { effectiveCapabilities, type Capability, type StaffRole } from '@/lib/permissions';

/**
 * Gate a route to one or more capabilities. ADMIN role passes
 * without a DB hit (effectiveCapabilities returns the full set).
 * STAFF triggers a single User lookup so we have the up-to-date
 * permissions[] — important because access tokens don't carry them
 * (and we want permission revokes to take effect immediately, not
 * after the next refresh).
 *
 * Pair with requireAuth so req.user is populated:
 *
 *   router.use(requireAuth, requireCapability('products.image-only'));
 */
export function requireCapability(...needed: Capability[]) {
  return async (req: AuthedRequest, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) throw HttpError.unauthorized();

    const role = req.user.role as StaffRole;
    if (role === 'ADMIN') {
      next();
      return;
    }

    let permissions: string[] = [];
    if (role === 'STAFF') {
      const u = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { permissions: true },
      });
      if (!u) throw HttpError.unauthorized();
      permissions = u.permissions;
    }

    const caps = effectiveCapabilities(role, permissions);
    const missing = needed.filter((c) => !caps.has(c));
    if (missing.length > 0) {
      throw HttpError.forbidden(
        `Missing required permission${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`,
      );
    }
    next();
  };
}
