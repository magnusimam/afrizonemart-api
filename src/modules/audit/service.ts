import type { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { logger } from '@/infra/logger';

export interface LogAuditInput {
  actorUserId?: string | null;
  actorEmail?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  changes?: Record<string, unknown>;
}

/**
 * Write an audit log row. Best-effort: failures here must NEVER take
 * down the business operation that triggered them. We log + swallow.
 */
export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        actorEmail: input.actorEmail ?? null,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        action: input.action,
        changes: (input.changes ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    logger.error('audit.write_failed', {
      error: err instanceof Error ? err.message : String(err),
      entityType: input.entityType,
      action: input.action,
    });
  }
}

export interface AdminListAuditQuery {
  page: number;
  limit: number;
  actorUserId?: string;
  entityType?: string;
  action?: string;
  from?: Date;
  to?: Date;
}

export async function adminListAudit(query: AdminListAuditQuery) {
  const where: Prisma.AuditLogWhereInput = {};
  if (query.actorUserId) where.actorUserId = query.actorUserId;
  if (query.entityType) where.entityType = query.entityType;
  if (query.action) where.action = query.action;
  if (query.from || query.to) {
    where.createdAt = {};
    if (query.from) where.createdAt.gte = query.from;
    if (query.to) where.createdAt.lte = query.to;
  }

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}
