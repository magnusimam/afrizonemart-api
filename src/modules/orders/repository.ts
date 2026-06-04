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
    include: {
      items: true,
      /// Customer-visible events feed the order timeline in
      /// /account/orders/[id] on web and the OrderDetail screen on
      /// mobile. Internal staff notes (`isCustomerVisible: false`)
      /// stay hidden — those are admin-only on /admin/orders/[id].
      events: {
        where: { isCustomerVisible: true },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          payload: true,
          createdAt: true,
        },
      },
    },
  });
}
