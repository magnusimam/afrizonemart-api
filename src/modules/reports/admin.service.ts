import type { Prisma } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import type {
  LowStockQuery,
  SalesQuery,
  TopQuery,
} from './admin.schema';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function defaultRange(from?: string, to?: string): { from: Date; to: Date } {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * DAY_MS);
  return { from: fromDate, to: toDate };
}

function bucketKey(date: Date, granularity: 'day' | 'week' | 'month'): string {
  const d = new Date(date);
  if (granularity === 'month') {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  if (granularity === 'week') {
    // ISO week-ish: subtract day-of-week to get the Monday before.
    const day = d.getUTCDay() || 7; // Sun=0 → 7
    const monday = new Date(d.getTime() - (day - 1) * DAY_MS);
    return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;
  }
  return d.toISOString().slice(0, 10);
}

interface SalesBucket {
  at: string;
  orders: number;
  revenue: number;
  refunded: number;
}

export async function reportSales(query: SalesQuery) {
  const { from, to } = defaultRange(query.from, query.to);
  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      status: { not: 'CANCELLED' },
    },
    select: {
      createdAt: true,
      total: true,
      refundedTotal: true,
    },
  });

  const map = new Map<string, SalesBucket>();
  for (const o of orders) {
    const key = bucketKey(o.createdAt, query.granularity);
    const existing = map.get(key) ?? { at: key, orders: 0, revenue: 0, refunded: 0 };
    existing.orders += 1;
    existing.revenue += o.total;
    existing.refunded += o.refundedTotal;
    map.set(key, existing);
  }

  const buckets = [...map.values()].sort((a, b) => a.at.localeCompare(b.at));
  const totals = buckets.reduce(
    (acc, b) => ({
      orders: acc.orders + b.orders,
      revenue: acc.revenue + b.revenue,
      refunded: acc.refunded + b.refunded,
    }),
    { orders: 0, revenue: 0, refunded: 0 },
  );

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    granularity: query.granularity,
    buckets,
    totals: { ...totals, net: totals.revenue - totals.refunded },
  };
}

export async function reportTopProducts(query: TopQuery) {
  const { from, to } = defaultRange(query.from, query.to);
  // Aggregate from OrderItem joined to Order to apply the date range
  // and exclude cancelled orders.
  const items = await prisma.orderItem.findMany({
    where: {
      order: {
        createdAt: { gte: from, lte: to },
        status: { not: 'CANCELLED' },
      },
    },
    select: {
      productId: true,
      productSlug: true,
      productName: true,
      quantity: true,
      lineTotal: true,
    },
  });

  type Row = { productId: string; slug: string; name: string; units: number; revenue: number };
  const map = new Map<string, Row>();
  for (const it of items) {
    const row =
      map.get(it.productId) ?? {
        productId: it.productId,
        slug: it.productSlug,
        name: it.productName,
        units: 0,
        revenue: 0,
      };
    row.units += it.quantity;
    row.revenue += it.lineTotal;
    map.set(it.productId, row);
  }

  const items_sorted = [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, query.limit);
  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    items: items_sorted,
  };
}

export async function reportTopCustomers(query: TopQuery) {
  const { from, to } = defaultRange(query.from, query.to);
  const grouped = await prisma.order.groupBy({
    by: ['userId'],
    where: { createdAt: { gte: from, lte: to }, status: { not: 'CANCELLED' } },
    _count: { _all: true },
    _sum: { total: true, refundedTotal: true },
    orderBy: { _sum: { total: 'desc' } },
    take: query.limit,
  });

  const userIds = grouped.map((g) => g.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, name: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const items = grouped.map((g) => {
    const u = userMap.get(g.userId);
    const revenue = (g._sum.total ?? 0) - (g._sum.refundedTotal ?? 0);
    return {
      userId: g.userId,
      email: u?.email ?? null,
      name: u?.name ?? null,
      orderCount: g._count._all,
      revenue: Math.max(0, revenue),
    };
  });

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    items,
  };
}

export async function reportLowStock(query: LowStockQuery) {
  // Today we only have a boolean inStock flag. Once we track per-SKU
  // quantities we'll switch to `quantity <= threshold`. For now this
  // is just an OOS report.
  const items = await prisma.product.findMany({
    where: { inStock: false },
    orderBy: { updatedAt: 'desc' },
    take: query.limit,
    select: {
      id: true,
      slug: true,
      name: true,
      brand: true,
      price: true,
      category: { select: { name: true } },
      updatedAt: true,
    },
  });
  return { items, note: 'Showing out-of-stock products. Per-SKU quantities + threshold land with the Inventory module.' };
}

// Suppress unused-export warning for prisma type alias.
export type _ReportsPrismaTypes = Prisma.OrderWhereInput;
