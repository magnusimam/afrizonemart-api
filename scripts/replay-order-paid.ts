/**
 * 2026-05-16 — manual replay of `order.paid` for orders that
 * flipped to PAID without their event subscribers firing
 * (the first run of `reconcile-pending-orders.ts` had this bug —
 * subscribers weren't wired in the script's process).
 *
 * Re-emits the event with the subscribers wired, so the missed
 * side effects fire: OrderConfirmed + PaymentReceived emails,
 * loyalty earn for the order.
 *
 * Pass orderIds (or order numbers) as args:
 *   railway run --service api npx tsx scripts/replay-order-paid.ts <orderId|orderNumber> [<orderId|orderNumber>...]
 *
 * The subscribers idempotent-check whatever they need (loyalty
 * skips duplicate EARN rows for the same causeOrderId, emails use
 * notification.context for dedup). So a replay on an order whose
 * side effects DID fire is safe — second run is a no-op.
 */
import { eventBus } from '@/infra/eventBus';
import { prisma } from '@/infra/prisma';
import { startLoyaltyEarnSubscriber } from '@/modules/loyalty/subscriber';
import { startNotificationDispatcher } from '@/modules/notifications/dispatcher';

async function run() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: replay-order-paid <orderId|orderNumber> [...]');
    process.exit(2);
  }

  startLoyaltyEarnSubscriber();
  startNotificationDispatcher();

  for (const ref of args) {
    const order = await prisma.order.findFirst({
      where: { OR: [{ id: ref }, { orderNumber: ref }] },
      include: {
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!order) {
      console.log(`✗ ${ref}: not found`);
      continue;
    }
    if (order.status !== 'PAID' && order.status !== 'FULFILLING') {
      console.log(`! ${ref}: status=${order.status}, refusing to replay`);
      continue;
    }
    const latest = order.payments[0];
    if (!latest) {
      console.log(`✗ ${ref}: no Payment row`);
      continue;
    }
    console.log(`→ Replaying order.paid for ${order.orderNumber} (${order.id})`);
    await eventBus.emit('order.paid', {
      orderId: order.id,
      paymentId: latest.id,
      method: latest.gateway,
      source: 'reconciliation_cron',
    });
    console.log(`  done`);
  }

  /// Give event handlers a beat to finish (they're awaited inside
  /// eventBus.emit but some sub-side-effects can still be in flight).
  await new Promise((r) => setTimeout(r, 1000));
}

run()
  .catch((e) => {
    console.error('Replay aborted:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
