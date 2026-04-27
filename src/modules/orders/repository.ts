import { prisma } from '@/infra/prisma';

export function findOrdersByUser(userId: string) {
  return prisma.order.findMany({
    where: { userId },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  });
}

export function findOrder(userId: string, idOrNumber: string) {
  return prisma.order.findFirst({
    where: {
      userId,
      OR: [{ id: idOrNumber }, { orderNumber: idOrNumber }],
    },
    include: { items: true },
  });
}
