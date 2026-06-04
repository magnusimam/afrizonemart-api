# Order + Payment Event Lifecycle

> Canonical map of every domain event in the order / payment flow and
> every side-effect that subscribes to it. Keep this in sync with the
> dispatcher files — when you add or remove a subscriber, edit this
> doc in the same commit so the wiring stays visible.
>
> **Rule:** subscribers MUST register inside their domain's
> `dispatcher.ts` or `subscriber.ts` file (notifications, webhooks,
> loyalty). Never `eventBus.on(...)` from a controller or service —
> scattered subscriptions are unfindable and cause leaks like the one
> that produced "Order confirmed" emails for failed payments.

## Triggers (who emits what)

| Event | Emitter | When |
|---|---|---|
| `order.placed` | `orders/service.ts → placeOrder()` | Right after the Order row is created (status PENDING_PAYMENT). Before any gateway call. |
| `order.paid` | `payments/service.ts → applyWebhookOutcome` (status SUCCEEDED + order was PENDING_PAYMENT) | (a) Squad webhook hits us, OR (b) post-redirect `verifyPayment` poll returns SUCCEEDED, OR (c) admin manually flips `PENDING_PAYMENT → PAID` in `/admin/orders`. All three funnel through the same emitter so subscribers see one canonical signal. |
| `payment.failed` | `payments/service.ts → applyWebhookOutcome` (status FAILED + order was PENDING_PAYMENT) | Squad webhook reports FAILED / ABANDONED, OR `verifyPayment` polls FAILED. Order stays PENDING_PAYMENT so the customer can retry. |
| `order.shipped` | `orders/admin.service.ts` | Admin status change `PAID → SHIPPED`. |
| `order.delivered` | `orders/admin.service.ts` | Admin status change `SHIPPED → DELIVERED`. |
| `order.cancelled` | `orders/admin.service.ts` | Admin status change `* → CANCELLED`. |
| `order.refunded` | `orders/admin.service.ts → adminRecordRefund()` | Admin records a refund (partial or full). |
| `order.note_added` | `orders/admin.service.ts` | Admin adds an internal/customer note. |

## Subscribers (what fires when)

| Event | Notifications | Loyalty | Webhooks (outbound) | WhatsApp (admin alert) | Push (mobile) |
|---|---|---|---|---|---|
| `order.placed` | **only** for BANK_TRANSFER / CASH_ON_DELIVERY: `OrderAwaitingPayment` email. **No email for online methods** — they wait for `order.paid`. | — | yes (dispatched to admin-configured webhook subscribers) | — | — |
| `order.paid` | `OrderConfirmed` + `PaymentReceived` emails | `awardCoinsForPaidOrder` — coin earn + tier check + welcome bonus | yes | yes — `new_order_alert` template sent to every number in `ORDER_NOTIFY_WHATSAPP_TO` via Meta WhatsApp Cloud API (`whatsapp-dispatcher.ts`). Silently no-ops when env not set. | yes — "Payment received" to every registered push token for the customer (`push-dispatcher.ts`). |
| `payment.failed` | `PaymentFailed` email (with gateway reason if any) | — | yes | — | yes — "Payment failed" |
| `order.shipped` | `OrderShipped` email | — | yes | — | yes — "On the way" |
| `order.delivered` | `OrderDelivered` email | — | yes | — | yes — "Delivered" |
| `order.cancelled` | `OrderCancelled` email | — | yes | — | yes — "Order cancelled" |
| `order.refunded` | `RefundIssued` email | `clawbackOnRefund` — REDEEM_REFUND always, REVERSAL on full refund | yes | — | — |
| `order.note_added` | only if `isCustomerVisible: true`: planned future email (not wired) | — | yes |

## Why this design has no holes

1. **`order.placed` is no longer customer-facing** for online payments. It used to send the "Order confirmed" email before any payment had happened — that's how the customer got a confirmation for a payment Squad rejected. The fix is structural: the confirmation email is now welded to `order.paid`, which is only fired when an order actually flips to PAID.

2. **One emit point per state transition.** `applyWebhookOutcome` is the only place that mutates `order.status` to PAID or moves a payment to SUCCEEDED. Three callers reach it (webhook, verify-redirect, admin manual). All three produce the same `order.paid` event, so subscribers don't fork.

3. **Bank-transfer + COD aren't second-class.** They get an immediate "Order received — awaiting payment" email on `order.placed` so the customer has something in their inbox. When admin later confirms the transfer in `/admin/orders`, `order.paid` fires (new in #47) and the customer gets the same `OrderConfirmed` + `PaymentReceived` emails as any online buyer.

4. **Failed payments are now observable.** `payment.failed` previously didn't exist — failed gateway transactions left the order silently stuck in PENDING_PAYMENT with no signal to the customer or admin. Now they get an email with the gateway's reason ("Merchant not configured for BIN", "Insufficient funds") and a link to retry.

5. **`source` field on `order.paid` / `payment.failed`.** Subscribers + audit log + analytics can distinguish webhook-driven from verify-driven from admin-driven flips. Useful when debugging "Squad never sent the webhook but the customer says they paid".

## Adding a new event

1. Add the event + payload to `EventMap` in `infra/eventBus.ts`.
2. Add the emit call in the relevant service. Emit AFTER the DB tx commits.
3. Subscribe in the dispatcher that owns the side effect (`notifications/dispatcher.ts` for emails, `loyalty/subscriber.ts` for coins, `webhooks/dispatcher.ts` for outbound).
4. Update this doc in the same commit.

## Anti-patterns to avoid

- `eventBus.on(...)` outside the official dispatchers — leads to "scattered subscriber" bugs that look like this one.
- Emitting an event from inside a `$transaction` — if the tx rolls back, subscribers still ran. Always emit AFTER `await prisma.$transaction(...)` resolves.
- Sending customer emails from a controller / route handler — they bypass the event bus and break the lifecycle map.
- Treating `order.placed` as "the customer placed and paid" — it's "the customer initiated checkout, payment outcome unknown".
