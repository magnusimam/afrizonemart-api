import * as React from 'react';
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { brand } from './_brand';

/**
 * Shared base layout for every transactional email.
 *
 * Why a shared layout: brand consistency, single place to swap the logo,
 * and one footer to maintain. Templates render their hero + body inside
 * `<EmailLayout>...</EmailLayout>` and stay focused on the content.
 *
 * Email clients (especially Outlook + Gmail) ignore `<style>` blocks and
 * cascade rules — every style here is inline, every layout is table-based
 * via React Email primitives, and all dimensions are in px not rem.
 */
export interface EmailLayoutProps {
  preview: string;
  children: React.ReactNode;
}

export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head>
        <meta name="x-apple-disable-message-reformatting" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {/* Navy header with brand mark */}
          <Section style={headerStyle}>
            <Img
              src={brand.logoUrl}
              alt="Afrizonemart"
              width="160"
              height="32"
              style={logoStyle}
            />
          </Section>

          {/* Amber accent stripe */}
          <Section style={accentStripeStyle}>&nbsp;</Section>

          {/* Body */}
          <Section style={bodyContainerStyle}>{children}</Section>

          {/* Footer */}
          <Hr style={hrStyle} />
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              Need help?{' '}
              <Link href={`mailto:${brand.supportEmail}`} style={linkStyle}>
                {brand.supportEmail}
              </Link>
            </Text>
            <Text style={footerSmallStyle}>
              Afrizonemart · Lagos, Nigeria · &copy;{' '}
              {new Date().getFullYear()} All rights reserved.
            </Text>
            <Text style={footerSmallStyle}>
              You are receiving this email because you have an account or
              placed an order at{' '}
              <Link href={brand.siteUrl} style={linkStyle}>
                afrizonemart.com
              </Link>
              .
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// ---------- Styles ----------

const bodyStyle: React.CSSProperties = {
  backgroundColor: brand.page,
  fontFamily: brand.fontBody,
  margin: 0,
  padding: '24px 0',
};

const containerStyle: React.CSSProperties = {
  backgroundColor: brand.white,
  border: `1px solid ${brand.border}`,
  borderRadius: '12px',
  margin: '0 auto',
  maxWidth: '600px',
  overflow: 'hidden',
  width: '100%',
};

const headerStyle: React.CSSProperties = {
  backgroundColor: brand.navy,
  padding: '24px 32px',
  textAlign: 'center' as const,
};

const logoStyle: React.CSSProperties = {
  display: 'inline-block',
  height: '32px',
  width: '160px',
};

const accentStripeStyle: React.CSSProperties = {
  backgroundColor: brand.amber,
  fontSize: 0,
  height: '4px',
  lineHeight: 0,
};

const bodyContainerStyle: React.CSSProperties = {
  padding: '32px',
};

const hrStyle: React.CSSProperties = {
  borderColor: brand.border,
  borderStyle: 'solid',
  borderWidth: '1px 0 0 0',
  margin: 0,
};

const footerStyle: React.CSSProperties = {
  backgroundColor: brand.page,
  padding: '24px 32px',
  textAlign: 'center' as const,
};

const footerTextStyle: React.CSSProperties = {
  color: brand.charcoal,
  fontSize: '14px',
  lineHeight: '20px',
  margin: '0 0 8px 0',
};

const footerSmallStyle: React.CSSProperties = {
  color: brand.muted,
  fontSize: '12px',
  lineHeight: '18px',
  margin: '4px 0',
};

const linkStyle: React.CSSProperties = {
  color: brand.navy,
  fontWeight: 600,
  textDecoration: 'underline',
};

// ---------- Reusable building blocks ----------

export const Heading = ({ children }: { children: React.ReactNode }) => (
  <Text
    style={{
      color: brand.navy,
      fontFamily: brand.fontHeading,
      fontSize: '26px',
      fontWeight: 700,
      lineHeight: '32px',
      margin: '0 0 12px 0',
    }}
  >
    {children}
  </Text>
);

export const SubHeading = ({ children }: { children: React.ReactNode }) => (
  <Text
    style={{
      color: brand.navy,
      fontFamily: brand.fontHeading,
      fontSize: '18px',
      fontWeight: 700,
      letterSpacing: '0.02em',
      margin: '24px 0 8px 0',
      textTransform: 'uppercase' as const,
    }}
  >
    {children}
  </Text>
);

export const Paragraph = ({ children }: { children: React.ReactNode }) => (
  <Text
    style={{
      color: brand.charcoal,
      fontSize: '15px',
      lineHeight: '24px',
      margin: '0 0 12px 0',
    }}
  >
    {children}
  </Text>
);

export const Button = ({ href, children }: { href: string; children: React.ReactNode }) => (
  // eslint-disable-next-line @next/next/no-html-link-for-pages
  <table
    role="presentation"
    cellPadding={0}
    cellSpacing={0}
    style={{ borderCollapse: 'collapse', margin: '8px 0 16px 0' }}
  >
    <tbody>
      <tr>
        <td
          style={{
            backgroundColor: brand.navy,
            borderRadius: '8px',
            padding: '12px 24px',
          }}
        >
          <Link
            href={href}
            style={{
              color: brand.white,
              fontFamily: brand.fontHeading,
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textDecoration: 'none',
              textTransform: 'uppercase' as const,
            }}
          >
            {children}
          </Link>
        </td>
      </tr>
    </tbody>
  </table>
);

export const InfoCard = ({ children }: { children: React.ReactNode }) => (
  <Section
    style={{
      backgroundColor: brand.page,
      border: `1px solid ${brand.border}`,
      borderRadius: '8px',
      margin: '16px 0',
      padding: '16px 20px',
    }}
  >
    {children}
  </Section>
);

export const Row = ({ label, value }: { label: string; value: string }) => (
  <table
    role="presentation"
    cellPadding={0}
    cellSpacing={0}
    width="100%"
    style={{ margin: '4px 0' }}
  >
    <tbody>
      <tr>
        <td
          style={{
            color: brand.muted,
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '0.04em',
            paddingRight: '12px',
            textTransform: 'uppercase' as const,
            verticalAlign: 'top',
            width: '40%',
          }}
        >
          {label}
        </td>
        <td
          style={{
            color: brand.charcoal,
            fontSize: '14px',
            fontWeight: 600,
            verticalAlign: 'top',
          }}
        >
          {value}
        </td>
      </tr>
    </tbody>
  </table>
);
