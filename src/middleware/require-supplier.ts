import type { NextFunction, Response } from 'express';
import type { AuthedRequest } from './auth';
import { prisma } from '@/infra/prisma';
import { HttpError } from './error-handler';

/**
 * Gate a route to authenticated SUPPLIER users. Pair with requireAuth so
 * `req.user` is populated. Looks up the Supplier row and decorates the
 * request with `supplierId` so downstream handlers can scope queries.
 *
 * ADMIN is also admitted so admin tooling can hit supplier-scoped
 * endpoints to inspect/help — admin-only operations should still be
 * mounted under /api/admin/... rather than relying on this gate.
 */
export interface SupplierAuthedRequest extends AuthedRequest {
  supplierId?: string;
}

export async function requireSupplier(
  req: SupplierAuthedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const role = req.user.role;
  if (role !== 'SUPPLIER' && role !== 'ADMIN') {
    throw HttpError.forbidden('This action requires a supplier account');
  }

  // For ADMIN we don't require a Supplier row — they can act on any
  // supplier scope via admin endpoints. Routes that genuinely need a
  // supplierId on the request (e.g. /api/suppliers/me/...) should
  // refuse if it's not set, and the SUPPLIER path always sets it.
  if (role === 'SUPPLIER') {
    const sup = await prisma.supplier.findUnique({
      where: { userId: req.user.id },
      select: { id: true },
    });
    if (!sup) {
      throw HttpError.forbidden(
        'Your account is marked as a supplier but no supplier profile exists. Contact support.',
      );
    }
    req.supplierId = sup.id;
  }

  next();
}
