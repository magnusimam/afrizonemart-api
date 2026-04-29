import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const existing = await p.category.findUnique({ where: { slug: 'fashion' } });
if (existing) {
  console.log('Fashion already exists:', existing.id);
} else {
  const c = await p.category.create({ data: { slug: 'fashion', name: 'Fashion' } });
  console.log('Created Fashion:', c.id);
}
await p.$disconnect();
