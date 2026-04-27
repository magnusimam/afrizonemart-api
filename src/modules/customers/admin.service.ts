import type { Prisma, User } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import type {
  AdminCustomerListQuery,
  UpdateCustomerBody,
} from './admin.schema';

interface CustomerStats {
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
}

/**
 * Aggregate orderCount + totalSpent + lastOrderAt for the given user
 * IDs in a single query. Excludes CANCELLED orders from totals (they
 * never produced revenue) but includes refunded orders' net amount.
 */
async function fetchStatsByUser(userIds: string[]): Promise<Map<string, CustomerStats>> {
  if (userIds.length === 0) return new Map();
  const grouped = await prisma.order.groupBy({
    by: ['userId'],
    where: { userId: { in: userIds }, status: { not: 'CANCELLED' } },
    _count: { _all: true },
    _sum: { total: true, refundedTotal: true },
    _max: { createdAt: true },
  });

  const map = new Map<string, CustomerStats>();
  for (const row of grouped) {
    const total = (row._sum.total ?? 0) - (row._sum.refundedTotal ?? 0);
    map.set(row.userId, {
      orderCount: row._count._all,
      totalSpent: Math.max(0, total),
      lastOrderAt: row._max.createdAt ? row._max.createdAt.toISOString() : null,
    });
  }
  return map;
}

function publicShape(user: User, stats: CustomerStats | undefined) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    orderCount: stats?.orderCount ?? 0,
    totalSpent: stats?.totalSpent ?? 0,
    lastOrderAt: stats?.lastOrderAt ?? null,
  };
}

export async function adminListCustomers(query: AdminCustomerListQuery) {
  const where: Prisma.UserWhereInput = {};
  if (query.role) where.role = query.role;
  if (query.q) {
    where.OR = [
      { email: { contains: query.q, mode: 'insensitive' } },
      { name: { contains: query.q, mode: 'insensitive' } },
    ];
  }

  // 'spend-desc' requires a join — easier to fetch a wider window then
  // sort in app code. For now spend-desc sorts the page's slice; a
  // proper sort would denormalise totalSpent onto User. Note for later.
  const orderBy: Prisma.UserOrderByWithRelationInput =
    query.sort === 'oldest'
      ? { createdAt: 'asc' }
      : query.sort === 'name-asc'
        ? { name: 'asc' }
        : { createdAt: 'desc' };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.user.count({ where }),
  ]);

  const stats = await fetchStatsByUser(users.map((u) => u.id));
  let items = users.map((u) => publicShape(u, stats.get(u.id)));

  if (query.sort === 'spend-desc') {
    items = [...items].sort((a, b) => b.totalSpent - a.totalSpent);
  }

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

export async function adminGetCustomer(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw HttpError.notFound('Customer not found');

  const [stats, recentOrders] = await Promise.all([
    fetchStatsByUser([id]),
    prisma.order.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { _count: { select: { items: true } } },
    }),
  ]);

  return {
    ...publicShape(user, stats.get(id)),
    recentOrders,
  };
}

export async function adminUpdateCustomer(
  id: string,
  body: UpdateCustomerBody,
  actorUserId: string,
) {
  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, email: true },
  });
  if (!existing) throw HttpError.notFound('Customer not found');

  // Self-demotion safety: don't let the only ADMIN demote themselves.
  if (
    body.role &&
    body.role !== 'ADMIN' &&
    existing.role === 'ADMIN' &&
    existing.id === actorUserId
  ) {
    const otherAdmins = await prisma.user.count({
      where: { role: 'ADMIN', NOT: { id: existing.id } },
    });
    if (otherAdmins === 0) {
      throw HttpError.badRequest(
        'Refusing to demote the last ADMIN — promote another user first.',
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name ?? null }),
      ...(body.role !== undefined && { role: body.role }),
    },
  });

  const stats = await fetchStatsByUser([id]);
  return publicShape(updated, stats.get(id));
}
