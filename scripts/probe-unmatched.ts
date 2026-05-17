import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const PROBES = [
  ['Goya Peanut Butter', 'goya'],
  ['Nescafe Classic Sachet 1.8g', 'nescafe sachet'],
  ['Dano Slim Milk Powder 380g', 'dano slim'],
  ['Lucozade Energy 50cl', 'lucozade energy'],
  ['Ribena Strawberry Concentrate', 'ribena strawberry'],
  ['Stella Artois', 'stella'],
  ['Corona Extra', 'corona'],
] as const;

async function main() {
  for (const [label, probe] of PROBES) {
    const rows = await prisma.product.findMany({
      where: { name: { contains: probe, mode: 'insensitive' } },
      select: { id: true, name: true, origin: true },
      take: 10,
    });
    console.log(`\n[${label}] probe="${probe}" → ${rows.length} hits`);
    for (const r of rows) console.log(`   · ${r.name}  [${r.origin ?? '-'}]  id=${r.id}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
