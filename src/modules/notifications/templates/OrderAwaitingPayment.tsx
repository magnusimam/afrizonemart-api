import * as React from 'react';
import { formatNGN } from './_brand';
import { Button, EmailLayout, Heading, InfoCard, Paragraph, Row } from './_layout';

/// Tracker #47 — sent on `order.placed` ONLY when the order is paid
/// out-of-band (Bank Transfer or Cash on Delivery). Confirms receipt
/// of the order but stops short of claiming "confirmed" — that comes
/// later, when admin manually marks the order PAID after the bank
/// transfer hits or the courier collects payment.

export interface OrderAwaitingPaymentProps {
  customerName: string;
  orderNumber: string;
  total: number;
  paymentMethodLabel: string;
  /// Bank-transfer rows pulled live from PaymentBankAccount so the
  /// instructions in the email match what's shown at checkout. Empty
  /// array for COD (irrelevant) or when no account is configured.
  bankAccounts: Array<{
    bankName: string;
    accountName: string;
    accountNumber: string;
    currency: string;
    instructions?: string | null;
  }>;
  reference: string;
  orderUrl: string;
}

export function OrderAwaitingPaymentEmail(props: OrderAwaitingPaymentProps) {
  const isBankTransfer = props.bankAccounts.length > 0;
  return (
    <EmailLayout
      preview={`We've received your order ${props.orderNumber} — awaiting payment`}
    >
      <Heading>Order received</Heading>
      <Paragraph>
        Hi {props.customerName}, we&rsquo;ve received order{' '}
        <strong>{props.orderNumber}</strong> for{' '}
        <strong>{formatNGN(props.total)}</strong>. We&rsquo;ll start preparing
        it as soon as we confirm payment.
      </Paragraph>

      <InfoCard>
        <Row label="Order #" value={props.orderNumber} />
        <Row label="Amount" value={formatNGN(props.total)} />
        <Row label="Method" value={props.paymentMethodLabel} />
        <Row label="Reference" value={props.reference} />
      </InfoCard>

      {isBankTransfer ? (
        <>
          <Paragraph>
            <strong>To confirm your order, please transfer to:</strong>
          </Paragraph>
          {props.bankAccounts.map((acc, i) => (
            <InfoCard key={i}>
              <Row label="Bank" value={acc.bankName} />
              <Row label="Account Name" value={acc.accountName} />
              <Row label="Account Number" value={acc.accountNumber} />
              <Row label="Currency" value={acc.currency} />
              {acc.instructions ? (
                <Row label="Notes" value={acc.instructions} />
              ) : null}
            </InfoCard>
          ))}
          <Paragraph>
            Please use the reference <strong>{props.reference}</strong> so we
            can match your transfer automatically.
          </Paragraph>
        </>
      ) : (
        <Paragraph>
          Our courier will collect payment in cash or by card terminal when
          your order is delivered. You&rsquo;ll get a confirmation email once
          we&rsquo;ve started preparing the shipment.
        </Paragraph>
      )}

      <Button href={props.orderUrl}>View order</Button>
    </EmailLayout>
  );
}

export default OrderAwaitingPaymentEmail;
