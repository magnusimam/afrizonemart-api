/**
 * Hit Squad's verify endpoint directly with each PENDING_PAYMENT
 * order's gatewayRef so we can see what Squad ACTUALLY reports for
 * each one. Removes our parseWebhook / applyWebhookOutcome layers
 * from the picture so we know whether the upstream gateway thinks
 * the payment landed.
 *
 *   railway run --service api npx tsx scripts/probe-squad-verify.ts
 *
 * Reads the active Squad gateway config from PaymentGatewayConfig.
 */
import { prisma } from '@/infra/prisma';
import { decryptSecret } from '@/lib/crypto-secret';

async function run() {
  const cfg = await prisma.paymentGatewayConfig.findFirst({
    where: { provider: 'squad', isActive: true },
  });
  if (!cfg) {
    console.error('No active Squad gateway config row.');
    return;
  }

  const credsRaw = cfg.credentials as Record<string, unknown>;
  let secret: string;
  try {
    secret = decryptSecret(credsRaw.secretKey);
  } catch (e) {
    console.error('Decrypt failed:', e);
    return;
  }

  const baseUrl =
    cfg.environment === 'live'
      ? 'https://api-d.squadco.com'
      : 'https://sandbox-api-d.squadco.com';

  console.log(
    `\nUsing Squad ${cfg.environment} (${baseUrl}). Secret prefix: ${secret.slice(0, 12)}…\n`,
  );

  const payments = await prisma.payment.findMany({
    where: { status: 'INITIATED' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { order: { select: { orderNumber: true, total: true } } },
  });

  for (const p of payments) {
    console.log(
      `Probing ${p.order.orderNumber}  total=${p.order.total} NGN  ref=${p.gatewayRef}`,
    );
    try {
      const res = await fetch(
        `${baseUrl}/transaction/verify/${encodeURIComponent(p.gatewayRef)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${secret}`,
            'Content-Type': 'application/json',
          },
        },
      );
      const body = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(body);
      } catch {
        json = body;
      }
      console.log(`  HTTP ${res.status}`);
      const obj = json as Record<string, unknown> | undefined;
      if (obj && typeof obj === 'object' && 'data' in obj) {
        const data = obj.data as Record<string, unknown>;
        console.log(
          `   success=${obj.success}  message=${obj.message ?? '—'}  transaction_status=${data?.transaction_status}  amount=${data?.transaction_amount}  currency=${data?.transaction_currency_id}`,
        );
      } else {
        console.log(`   body: ${JSON.stringify(json).slice(0, 400)}`);
      }
    } catch (err) {
      console.log(`  ERROR ${err instanceof Error ? err.message : String(err)}`);
    }
    console.log('');
  }
}

run()
  .catch((e) => {
    console.error('Probe aborted:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
