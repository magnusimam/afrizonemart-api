/**
 * 2026-05-16 — one-off reconciliation. Walks every PENDING_PAYMENT
 * order, asks the gateway "is this paid?", applies the answer.
 * Idempotent — orders that have already settled or that the gateway
 * still reports as pending are no-ops.
 *
 *   railway run --service api npx tsx scripts/reconcile-pending-orders.ts
 *
 * Use after deploying the cron + the gatewayById bugfix to clear out
 * orders that were stuck during the buggy window. Same path the cron
 * uses on every tick, so running this is exactly equivalent to
 * "force the next cron sweep to run now".
 */
import { prisma } from '@/infra/prisma';
import { reconcilePendingOrder } from '@/modules/payments/service';
import { startLoyaltyEarnSubscriber } from '@/modules/loyalty/subscriber';
import { startNotificationDispatcher } from '@/modules/notifications/dispatcher';

async function run() {
  /// 2026-05-16 — wire subscribers in this script's process so
  /// order.paid / payment.failed events trigger loyalty earn +
  /// customer emails the same way the in-process reconciliation
  /// cron does. The first run of this script forgot this and the
  /// flipped order's events fired with handlerCount=0.
  startLoyaltyEarnSubscriber();
  startNotificationDispatcher();

  const orders = await prisma.order.findMany({
    where: { status: 'PENDING_PAYMENT' },
    select: { id: true, orderNumber: true, total: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`\nReconciling ${orders.length} PENDING_PAYMENT orders…\n`);

  let flipped = 0;
  let stillPending = 0;
  let errored = 0;
  for (const o of orders) {
    process.stdout.write(
      `  ${o.orderNumber} (₦${o.total}, placed ${o.createdAt.toISOString()}) — `,
    );
    try {
      const result = await reconcilePendingOrder(o.id, 'reconciliation_cron');
      if (result.changed) {
        flipped++;
        console.log(`→ ${result.status} ✓`);
      } else {
        stillPending++;
        console.log(`still ${result.status}`);
      }
    } catch (err) {
      errored++;
      console.log(`ERROR ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(
    `\nDone. ${flipped} flipped, ${stillPending} still pending, ${errored} errored.`,
  );
}

run()
  .catch((e) => {
    console.error('Reconcile aborted:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
