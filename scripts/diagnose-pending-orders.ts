/**
 * One-off diagnostic: dump every PENDING_PAYMENT order with its
 * Payment rows + any matching InboundWebhookEvent rows by gatewayRef.
 * Use to figure out why an order is stuck (no webhook? verify
 * failed? signature mismatch?).
 *
 *   railway run --service api npx tsx scripts/diagnose-pending-orders.ts
 */
import { prisma } from '@/infra/prisma';

async function run() {
  const orders = await prisma.order.findMany({
    where: { status: 'PENDING_PAYMENT' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      payments: { orderBy: { createdAt: 'desc' } },
      user: { select: { id: true, email: true } },
    },
  });
  console.log(`\nFound ${orders.length} PENDING_PAYMENT orders (newest 20):\n`);

  for (const o of orders) {
    console.log(`Order ${o.orderNumber}  user=${o.user.email}`);
    console.log(`  id=${o.id}  total=${o.currency} ${o.total}  method=${o.paymentMethod}`);
    console.log(`  placed=${o.createdAt.toISOString()}  paymentRef=${o.paymentRef ?? '—'}`);
    for (const p of o.payments) {
      console.log(
        `   - Payment ${p.id} gateway=${p.gateway} status=${p.status} ref=${p.gatewayRef}`,
      );
      const inbound = await prisma.inboundWebhookEvent.findMany({
        where: { provider: p.gateway },
        orderBy: { receivedAt: 'desc' },
        take: 3,
      });
      if (inbound.length > 0) {
        console.log(`     last ${inbound.length} webhook events for "${p.gateway}":`);
        for (const w of inbound) {
          console.log(`       ${w.receivedAt.toISOString()} outcome=${w.outcome} hash=${w.bodyHash.slice(0, 12)}…`);
        }
      } else {
        console.log(`     (no inbound webhook events recorded for "${p.gateway}")`);
      }
    }
    console.log('');
  }

  console.log(`\nGateway configs:\n`);
  const gateways = await prisma.paymentGatewayConfig.findMany({});
  for (const g of gateways) {
    const credKeys = Object.keys(
      g.credentials && typeof g.credentials === 'object' && !Array.isArray(g.credentials)
        ? g.credentials
        : {},
    );
    console.log(
      `  ${g.label} provider=${g.provider} env=${g.environment} active=${g.isActive} currencies=${g.currencies.join(',')} credKeys=${credKeys.join(',')}`,
    );
  }
}

run()
  .catch((err) => {
    console.error('Diagnostic aborted:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
