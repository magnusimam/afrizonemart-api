import type { User, UserRole } from '@prisma/client';
import { prisma } from '@/infra/prisma';

/**
 * Prisma queries for the Auth module. Service layer above; HTTP layer
 * never touches Prisma directly (Principle #6).
 */

export function findUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } });
}

export function findUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

export function createUser(data: {
  email: string;
  passwordHash: string;
  name?: string;
  role?: UserRole;
}): Promise<User> {
  return prisma.user.create({
    data: {
      email: data.email,
      passwordHash: data.passwordHash,
      name: data.name,
      role: data.role,
    },
  });
}

export function setRefreshTokenHash(
  userId: string,
  refreshTokenHash: string | null,
): Promise<User> {
  return prisma.user.update({
    where: { id: userId },
    data: { refreshTokenHash },
  });
}
