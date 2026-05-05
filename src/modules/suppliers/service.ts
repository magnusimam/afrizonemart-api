import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';

/**
 * Supplier-facing operations on the supplier's own profile. Every
 * function here is scoped to a single supplierId; admin operations
 * across all suppliers live in admin.service.ts.
 */

export interface SupplierMe {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  companyName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  country: string | null;
  address: string | null;
  currentStage: number;
  maxStage: number;
  minimumPIQsRequired: number;
  createdAt: string;
  updatedAt: string;
}

export async function getSupplierMe(supplierId: string): Promise<SupplierMe> {
  const row = await prisma.supplier.findUnique({
    where: { id: supplierId },
    include: { user: { select: { email: true, name: true } } },
  });
  if (!row) throw HttpError.notFound('Supplier profile not found');
  return {
    id: row.id,
    userId: row.userId,
    email: row.user.email,
    name: row.user.name,
    companyName: row.companyName,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    country: row.country,
    address: row.address,
    currentStage: row.currentStage,
    maxStage: row.maxStage,
    minimumPIQsRequired: row.minimumPIQsRequired,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Patch the supplier's own profile fields. Only profile-shape fields
 * are writeable from this surface — currentStage / maxStage /
 * minimumPIQsRequired are admin-only (see admin.service.ts).
 */
export async function updateSupplierMe(
  supplierId: string,
  patch: {
    companyName?: string | null;
    contactName?: string | null;
    contactPhone?: string | null;
    country?: string | null;
    address?: string | null;
  },
): Promise<SupplierMe> {
  await prisma.supplier.update({
    where: { id: supplierId },
    data: patch,
  });
  return getSupplierMe(supplierId);
}
