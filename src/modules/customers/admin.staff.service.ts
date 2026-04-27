import bcrypt from 'bcryptjs';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import {
  CAPABILITY_LABELS,
  ROLE_CAPABILITIES,
  ROLE_DESCRIPTIONS,
  type Capability,
  type StaffRole,
} from '@/lib/permissions';
import type { CreateStaffBody } from './admin.staff.schema';

const BCRYPT_ROUNDS = 12;

export async function listStaff() {
  const users = await prisma.user.findMany({
    where: { role: { in: ['SELLER', 'ADMIN'] } },
    orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });
  return { items: users };
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
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  return created;
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
    roles: (['CUSTOMER', 'SELLER', 'ADMIN'] as StaffRole[]).map((role) => ({
      role,
      description: ROLE_DESCRIPTIONS[role],
      capabilities: ROLE_CAPABILITIES[role],
    })),
  };
}
