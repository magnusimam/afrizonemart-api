/**
 * Abstract gateway contract every payment provider must implement.
 *
 * Adding a new provider (GT Squad, Paystack, Flutterwave, …) is one
 * file: a new class implementing this interface, registered in the
 * factory below. The rest of the system never knows which provider it
 * talks to.
 */

export interface InitArgs {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  customerEmail: string;
  customerName?: string | null;
  callbackUrl: string;
}

export interface InitResult {
  /** Gateway's reference for this attempt — used to look the payment up later. */
  gatewayRef: string;
  /** URL to redirect the customer to. */
  checkoutUrl: string;
  /** Anything we want to keep around for debugging. */
  rawPayload?: Record<string, unknown>;
}

export type WebhookOutcome =
  | { status: 'SUCCEEDED'; gatewayRef: string; rawPayload: Record<string, unknown> }
  | { status: 'FAILED'; gatewayRef: string; rawPayload: Record<string, unknown> }
  | { status: 'IGNORED'; reason: string };

export interface PaymentGateway {
  readonly id: string;
  init(args: InitArgs): Promise<InitResult>;
  /**
   * Verify + parse a webhook delivery. Implementations validate the
   * provider's signature header and return either a payment status or
   * IGNORED if the delivery isn't relevant.
   */
  parseWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookOutcome>;
  /** Server-side polling fallback for when the webhook is delayed. */
  verify(gatewayRef: string): Promise<WebhookOutcome>;
}
