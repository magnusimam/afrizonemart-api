import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '@/middleware/auth';
import { HttpError } from '@/middleware/error-handler';
import {
  activeGateways,
  applyWebhookOutcome,
  checkOrderPayment,
  initPayment,
  verifyPayment,
} from './service';
import { signStubBody } from './stub-gateway';

const initBody = z.object({ orderId: z.string().min(1) });

export async function initPaymentHandler(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const { orderId } = initBody.parse(req.body);
  res.json(await initPayment(orderId, req.user.id));
}

export async function webhookHandler(req: Request, res: Response): Promise<void> {
  // Use the raw body bytes captured by express.json's verify hook
  // (server.ts) so the gateway's HMAC verification matches what was
  // signed on the wire. Fallback to stringifying the parsed body for
  // stub-driven local tests where raw capture might not run.
  const raw = (req as { rawBody?: Buffer }).rawBody;
  const rawBody = raw ? raw.toString('utf8') : JSON.stringify(req.body);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers[k.toLowerCase()] = v;
  }
  // Walk every active gateway and let each try to parse the delivery.
  // The first one that returns a non-IGNORED outcome wins. Lets us run
  // multiple providers (Squad + Paystack + …) on the same webhook URL.
  const gateways = await activeGateways();
  let outcome: Awaited<ReturnType<(typeof gateways)[0]['parseWebhook']>> = {
    status: 'IGNORED',
    reason: 'No active gateway recognised this delivery',
  };
  let winningProvider: string | undefined;
  for (const gw of gateways) {
    const tryOutcome = await gw.parseWebhook(rawBody, headers);
    if (tryOutcome.status !== 'IGNORED') {
      outcome = tryOutcome;
      winningProvider = gw.id;
      break;
    }
  }
  // Phase 11.3 (audit H3): replay guard. SHA-256 the raw body bytes
  // and pair with the provider id; the service writes a unique row
  // before mutating Payment+Order so an identical replay can never
  // re-flip the order. IGNORED outcomes (bad signature, wrong format,
  // unrecognised) skip the guard so they never poison the dedup table.
  const replayGuard = winningProvider
    ? { provider: winningProvider, bodyHash: createHash('sha256').update(rawBody).digest('hex') }
    : undefined;
  const result = await applyWebhookOutcome(outcome, replayGuard);
  res.status(result.acknowledged ? 200 : 202).json(result);
}

export async function verifyHandler(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const ref = req.params.reference;
  if (!ref) throw HttpError.badRequest('Missing reference');
  res.json(await verifyPayment(ref, req.user.id));
}

export async function checkOrderHandler(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw HttpError.unauthorized();
  const orderRef = req.params.orderRef;
  if (!orderRef) throw HttpError.badRequest('Missing order reference');
  res.json(await checkOrderPayment(orderRef, req.user.id));
}

/**
 * Stub-only convenience endpoint. Renders a tiny "processing payment…"
 * page that, after 1.5s, fires the signed webhook back to our own
 * server, then redirects the user to the callback URL with success=1.
 *
 * Real gateways replace this with their own hosted checkout page.
 */
export function stubCheckoutHandler(req: Request, res: Response): void {
  const gatewayRef = req.params.ref;
  const callback = (req.query.cb as string) ?? '/';
  if (!gatewayRef) {
    res.status(400).send('Missing ref');
    return;
  }
  const apiBase = process.env.API_PUBLIC_URL ?? 'http://localhost:4000';
  const body = JSON.stringify({ gatewayRef, status: 'SUCCEEDED' });
  const sig = signStubBody(body);

  res.type('html').send(`<!doctype html>
<html><head><title>Stub gateway · processing</title>
<style>
  body { font-family: system-ui, sans-serif; background:#0D1F4E; color:white; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
  .card { background:white; color:#0D1F4E; padding:32px 40px; border-radius:12px; max-width:420px; text-align:center; }
  .ref { font-family:monospace; font-size:11px; color:#666; margin-top:8px; word-break:break-all; }
  .spinner { width:32px; height:32px; border:3px solid #eee; border-top-color:#F5A623; border-radius:50%; margin:16px auto; animation:spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
</head><body>
<div class="card">
  <strong>Stub gateway</strong>
  <div class="spinner"></div>
  <p>Simulating successful payment…</p>
  <div class="ref">${gatewayRef}</div>
</div>
<script>
  setTimeout(async () => {
    try {
      await fetch(${JSON.stringify(`${apiBase}/api/payments/webhook`)}, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Stub-Signature': ${JSON.stringify(sig)} },
        body: ${JSON.stringify(body)},
      });
    } catch (e) {}
    window.location.href = ${JSON.stringify(callback)};
  }, 1500);
</script>
</body></html>`);
}
