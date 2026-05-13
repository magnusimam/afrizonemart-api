import * as React from 'react';
import { Hr, Link, Section, Text } from '@react-email/components';
import { brand } from './_brand';
import { EmailLayout } from './_layout';

/**
 * Tracker #48 — wrapper for marketing emails (campaigns, drip flows,
 * newsletter). Adds a legally-required "why am I getting this" + the
 * one-click unsubscribe link to the footer.
 *
 * Transactional templates (OrderConfirmed / PasswordReset / etc.)
 * keep using `<EmailLayout>` directly — they're triggered by user
 * action so they don't need an unsubscribe footer.
 *
 * Marketing templates accept a `unsubscribeUrl` prop. Generate it
 * with `buildUnsubscribeUrl(userId, 'email')` from the marketing
 * service.
 */

export interface MarketingEmailLayoutProps {
  preview: string;
  unsubscribeUrl: string;
  /// Short campaign tag shown above the unsubscribe line ("Weekly
  /// deals", "Continental Rewards updates"). Optional — defaults to
  /// "Afrizonemart newsletter".
  campaignLabel?: string;
  children: React.ReactNode;
}

const footerWrap: React.CSSProperties = {
  margin: '32px 0 0 0',
};

const footerHr: React.CSSProperties = {
  borderColor: brand.border,
  margin: '0 0 16px 0',
};

const footerText: React.CSSProperties = {
  color: brand.muted,
  fontFamily: brand.fontBody,
  fontSize: '11px',
  lineHeight: '16px',
  margin: '0 0 6px 0',
  textAlign: 'center',
};

const footerLink: React.CSSProperties = {
  color: brand.navy,
  fontWeight: 600,
  textDecoration: 'underline',
};

export function MarketingEmailLayout({
  preview,
  unsubscribeUrl,
  campaignLabel,
  children,
}: MarketingEmailLayoutProps) {
  return (
    <EmailLayout preview={preview}>
      {children}
      <Section style={footerWrap}>
        <Hr style={footerHr} />
        <Text style={footerText}>
          You&rsquo;re getting this email as part of{' '}
          <strong>{campaignLabel ?? 'Afrizonemart newsletter'}</strong>{' '}
          because you opted into marketing emails when you signed up or
          on your account profile.
        </Text>
        <Text style={footerText}>
          <Link href={unsubscribeUrl} style={footerLink}>
            Unsubscribe with one click
          </Link>{' '}
          — we&rsquo;ll stop immediately. Transactional emails (orders,
          shipping, payment receipts) won&rsquo;t be affected.
        </Text>
      </Section>
    </EmailLayout>
  );
}
