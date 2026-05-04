import bcrypt from 'bcryptjs';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import {
  CAPABILITY_LABELS,
  ROLE_CAPABILITIES,
  ROLE_DESCRIPTIONS,
  effectiveCapabilities,
  type Capability,
  type StaffRole,
} from '@/lib/permissions';
import type { CreateStaffBody, UpdateStaffBody } from './admin.staff.schema';

const BCRYPT_ROUNDS = 12;

export async function listStaff() {
  const users = await prisma.user.findMany({
    where: { role: { in: ['SELLER', 'ADMIN', 'STAFF'] } },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      permissions: true,
      createdAt: true,
    },
  });
  // Surface effective capabilities so the admin UI can show "what they
  // can actually do today" without re-running the resolution itself.
  return {
    items: users.map((u) => ({
      ...u,
      effectivePermissions: Array.from(
        effectiveCapabilities(u.role as StaffRole, u.permissions),
      ),
    })),
  };
}

export async function getStaff(id: string) {
  const u = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      permissions: true,
      createdAt: true,
    },
  });
  if (!u) throw HttpError.notFound('Staff member not found');
  if (!['SELLER', 'ADMIN', 'STAFF'].includes(u.role)) {
    throw HttpError.notFound('User exists but is not a staff member');
  }
  return {
    ...u,
    effectivePermissions: Array.from(
      effectiveCapabilities(u.role as StaffRole, u.permissions),
    ),
  };
}

export async function createStaff(body: CreateStaffBody) {
  const existing = await prisma.user.findUnique({
    where: { email: body.email },
    select: { id: true, email: true, role: true },
  });
  if (existing) {
    throw HttpError.conflict(
      `${body.email} already exists with role ${existing.role}. Promote them via the customer detail page instead.`,
    );
  }

  const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
  const created = await prisma.user.create({
    data: {
      email: body.email,
      passwordHash,
      name: body.name,
      role: body.role,
      // STAFF role uses per-user permissions; SELLER/ADMIN ignore them
      // (their effective set comes from ROLE_CAPABILITIES).
      permissions: body.role === 'STAFF' ? body.permissions ?? [] : [],
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      permissions: true,
      createdAt: true,
    },
  });
  return {
    ...created,
    effectivePermissions: Array.from(
      effectiveCapabilities(created.role as StaffRole, created.permissions),
    ),
  };
}

export async function updateStaff(id: string, body: UpdateStaffBody) {
  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!existing) throw HttpError.notFound('Staff member not found');

  // Don't let an admin lock themselves out by demoting the only ADMIN.
  if (body.role && body.role !== 'ADMIN' && existing.role === 'ADMIN') {
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
    if (adminCount <= 1) {
      throw HttpError.badRequest(
        'Cannot demote the last ADMIN — promote another user to ADMIN first.',
      );
    }
  }

  const data: {
    name?: string | null;
    role?: 'SELLER' | 'ADMIN' | 'STAFF';
    permissions?: string[];
    passwordHash?: string;
  } = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.role !== undefined) data.role = body.role;
  if (body.permissions !== undefined) {
    // Only meaningful when the resulting role is STAFF; for SELLER/ADMIN
    // we silently store [] so a future role flip starts clean.
    const targetRole = body.role ?? existing.role;
    data.permissions = targetRole === 'STAFF' ? body.permissions : [];
  } else if (body.role && body.role !== 'STAFF') {
    // Role flipped away from STAFF without a fresh permissions list —
    // clear the leftover grants so they don't apply if flipped back.
    data.permissions = [];
  }
  if (body.password) {
    data.passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      permissions: true,
      createdAt: true,
    },
  });
  return {
    ...updated,
    effectivePermissions: Array.from(
      effectiveCapabilities(updated.role as StaffRole, updated.permissions),
    ),
  };
}

export async function deleteStaff(id: string) {
  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!existing) throw HttpError.notFound('Staff member not found');
  if (existing.role === 'ADMIN') {
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
    if (adminCount <= 1) {
      throw HttpError.badRequest('Cannot delete the last ADMIN.');
    }
  }
  // Demote rather than delete so order/audit history stays intact.
  await prisma.user.update({
    where: { id },
    data: { role: 'CUSTOMER', permissions: [] },
  });
}

interface RolePermissions {
  role: StaffRole;
  description: string;
  capabilities: Capability[];
}

export interface PermissionsMatrix {
  capabilities: Array<{
    key: Capability;
    domain: string;
    label: string;
  }>;
  roles: RolePermissions[];
}

export function getPermissionsMatrix(): PermissionsMatrix {
  return {
    capabilities: (Object.keys(CAPABILITY_LABELS) as Capability[]).map((key) => ({
      key,
      ...CAPABILITY_LABELS[key],
    })),
    roles: (['CUSTOMER', 'SELLER', 'STAFF', 'ADMIN'] as StaffRole[]).map((role) => ({
      role,
      description: ROLE_DESCRIPTIONS[role],
      capabilities: ROLE_CAPABILITIES[role],
    })),
  };
}
