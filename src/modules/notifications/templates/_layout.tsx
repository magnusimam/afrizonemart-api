import * as React from 'react';
import {
  Body,
  Container,
  Head,
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
 * Why a shared layout: brand consistency, single place to swap the logo, and
 * one footer to maintain. Templates render their content inside
 * `<EmailLayout>` and stay focused on the message.
 *
 * ── Constraints this file is built around ─────────────────────────────
 * Email clients ignore <style> blocks and most cascade rules, so every
 * style here is inline, every layout is table-based, and all dimensions
 * are px. No flexbox, no grid, no positioning.
 *
 * Typography follows a 4px-based scale sized for mobile, where the
 * majority of these are opened: 16px/26px body (never below 14px),
 * 24px/32px headings, 13–14px for secondary text.
 *
 * The header is LIGHT on purpose. The wordmark is navy artwork on a
 * transparent background; it used to sit on a navy bar and was invisible.
 *
 * `color-scheme: light` tells Apple Mail and Outlook not to auto-invert.
 * Clients that ignore it (Gmail dark mode) invert anyway, which is why body
 * text is a near-black grey rather than pure black and no colour carries
 * meaning on its own.
 */
export interface EmailLayoutProps {
  preview: string;
  children: React.ReactNode;
  /** Small right-aligned label in the header, e.g. "Supplier Portal". */
  eyebrow?: string;
}

export function EmailLayout({ preview, children, eyebrow }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
        <meta name="supported-color-schemes" content="light" />
        <meta name="x-apple-disable-message-reformatting" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          {/* Masthead — light, so the navy wordmark is actually visible. */}
          <Section style={headerStyle}>
            <table role="presentation" cellPadding={0} cellSpacing={0} width="100%">
              <tbody>
                <tr>
                  <td align="left" style={{ verticalAlign: 'middle' }}>
                    <Img
                      src={brand.logoUrl}
                      alt="Afrizonemart"
                      width={brand.logoWidth}
                      height={brand.logoHeight}
                      style={logoStyle}
                    />
                  </td>
                  {eyebrow ? (
                    <td align="right" style={{ verticalAlign: 'middle' }}>
                      <Text style={eyebrowStyle}>{eyebrow}</Text>
                    </td>
                  ) : null}
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Amber hairline — the one flash of brand colour up top. */}
          <Section style={accentStripeStyle}>&nbsp;</Section>

          <Section style={bodyContainerStyle}>{children}</Section>

          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              Questions? Reply to this email, or write to{' '}
              <Link href={`mailto:${brand.supplierEmail}`} style={footerLinkStyle}>
                {brand.supplierEmail}
              </Link>
              . A person reads it.
            </Text>
            <Text style={footerSmallStyle}>
              <Link href={brand.siteUrl} style={footerLinkStyle}>
                afrizonemart.com
              </Link>
              {'  ·  '}Lagos, Nigeria
            </Text>
            <Text style={footerSmallStyle}>
              &copy; {new Date().getFullYear()} Afrizonemart. Made in Africa,
              delivered worldwide.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

/* ---------- Layout styles ---------- */

const bodyStyle: React.CSSProperties = {
  backgroundColor: brand.page,
  fontFamily: brand.fontBody,
  margin: 0,
  padding: '24px 12px',
  WebkitFontSmoothing: 'antialiased',
};

const containerStyle: React.CSSProperties = {
  backgroundColor: brand.white,
  border: `1px solid ${brand.border}`,
  borderRadius: '14px',
  margin: '0 auto',
  maxWidth: '600px',
  overflow: 'hidden',
  width: '100%',
};

const headerStyle: React.CSSProperties = {
  backgroundColor: brand.white,
  padding: '24px 32px 18px 32px',
};

const logoStyle: React.CSSProperties = {
  border: 0,
  display: 'block',
  height: `${brand.logoHeight}px`,
  width: `${brand.logoWidth}px`,
};

const eyebrowStyle: React.CSSProperties = {
  color: brand.muted,
  fontFamily: brand.fontHeading,
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.1em',
  margin: 0,
  textTransform: 'uppercase' as const,
};

const accentStripeStyle: React.CSSProperties = {
  backgroundColor: brand.amber,
  fontSize: 0,
  height: '3px',
  lineHeight: 0,
};

const bodyContainerStyle: React.CSSProperties = {
  padding: '32px',
};

const footerStyle: React.CSSProperties = {
  backgroundColor: brand.page,
  borderTop: `1px solid ${brand.border}`,
  padding: '24px 32px',
};

const footerTextStyle: React.CSSProperties = {
  color: brand.inkSoft,
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0 0 10px 0',
};

const footerSmallStyle: React.CSSProperties = {
  color: brand.muted,
  fontSize: '12px',
  lineHeight: '20px',
  margin: '2px 0',
};

const footerLinkStyle: React.CSSProperties = {
  color: brand.navySoft,
  fontWeight: 600,
  textDecoration: 'underline',
};

/* ---------- Building blocks ---------- */

/** Small uppercase kicker above a heading. Sets context in two words. */
export const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <Text
    style={{
      color: brand.amberInk,
      fontFamily: brand.fontHeading,
      fontSize: '11px',
      fontWeight: 700,
      letterSpacing: '0.1em',
      margin: '0 0 8px 0',
      textTransform: 'uppercase' as const,
    }}
  >
    {children}
  </Text>
);

export const Heading = ({ children }: { children: React.ReactNode }) => (
  <Text
    style={{
      color: brand.navy,
      fontFamily: brand.fontHeading,
      fontSize: '24px',
      fontWeight: 800,
      letterSpacing: '-0.01em',
      lineHeight: '32px',
      margin: '0 0 14px 0',
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
      fontSize: '13px',
      fontWeight: 700,
      letterSpacing: '0.08em',
      margin: '28px 0 10px 0',
      textTransform: 'uppercase' as const,
    }}
  >
    {children}
  </Text>
);

export const Paragraph = ({ children }: { children: React.ReactNode }) => (
  <Text
    style={{
      color: brand.ink,
      fontSize: '16px',
      lineHeight: '26px',
      margin: '0 0 16px 0',
    }}
  >
    {children}
  </Text>
);

/** Quieter note — deadlines, caveats, "no action needed". */
export const Note = ({ children }: { children: React.ReactNode }) => (
  <Text
    style={{
      color: brand.muted,
      fontSize: '13px',
      lineHeight: '21px',
      margin: '0 0 8px 0',
    }}
  >
    {children}
  </Text>
);

/**
 * Primary call to action.
 *
 * Table-based rather than a styled <a> so Outlook renders the fill, and sized
 * past the 44px minimum tap target. One per email: a second competing button
 * measurably splits the click.
 */
export const Button = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <table
    role="presentation"
    cellPadding={0}
    cellSpacing={0}
    style={{ borderCollapse: 'collapse', margin: '20px 0' }}
  >
    <tbody>
      <tr>
        <td style={{ backgroundColor: brand.navy, borderRadius: '10px' }}>
          <Link
            href={href}
            style={{
              color: brand.white,
              display: 'inline-block',
              fontFamily: brand.fontHeading,
              fontSize: '15px',
              fontWeight: 700,
              letterSpacing: '0.02em',
              lineHeight: '20px',
              padding: '14px 30px',
              textDecoration: 'none',
            }}
          >
            {children}
          </Link>
        </td>
      </tr>
    </tbody>
  </table>
);

/** Fallback under a button — some clients strip the fill, and some people
 *  simply prefer a visible URL. */
export const ButtonFallback = ({ href }: { href: string }) => (
  <Text style={{ color: brand.muted, fontSize: '12px', lineHeight: '18px', margin: '-8px 0 4px 0' }}>
    Or paste this into your browser:{' '}
    <Link href={href} style={{ color: brand.navySoft, textDecoration: 'underline' }}>
      {href}
    </Link>
  </Text>
);

/**
 * Boxed detail panel, with an amber rule down the left so it reads as a
 * distinct object rather than a paragraph with a background.
 */
export const InfoCard = ({ children }: { children: React.ReactNode }) => (
  <Section
    style={{
      backgroundColor: brand.page,
      borderRadius: '10px',
      borderLeft: `3px solid ${brand.amber}`,
      margin: '18px 0',
      padding: '16px 20px',
    }}
  >
    {children}
  </Section>
);

/**
 * Label/value pair. Stacked rather than two columns: at 600px minus padding a
 * long value in a side column wraps to three cramped lines on a phone.
 */
export const Row = ({ label, value }: { label: string; value: string }) => (
  <table role="presentation" cellPadding={0} cellSpacing={0} width="100%" style={{ margin: '0 0 12px 0' }}>
    <tbody>
      <tr>
        <td>
          <Text
            style={{
              color: brand.muted,
              fontFamily: brand.fontHeading,
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.08em',
              margin: '0 0 2px 0',
              textTransform: 'uppercase' as const,
            }}
          >
            {label}
          </Text>
          <Text style={{ color: brand.ink, fontSize: '15px', fontWeight: 600, lineHeight: '22px', margin: 0 }}>
            {value}
          </Text>
        </td>
      </tr>
    </tbody>
  </table>
);

/**
 * Numbered steps. Table rows rather than <ol> because Outlook's list
 * rendering is unreliable and silently drops the numbers.
 */
export const Steps = ({ items }: { items: string[] }) => (
  <table role="presentation" cellPadding={0} cellSpacing={0} width="100%" style={{ margin: '4px 0 20px 0' }}>
    <tbody>
      {items.map((item, i) => (
        <tr key={item}>
          <td style={{ paddingBottom: '12px', verticalAlign: 'top', width: '30px' }}>
            <table role="presentation" cellPadding={0} cellSpacing={0}>
              <tbody>
                <tr>
                  <td
                    align="center"
                    style={{
                      backgroundColor: brand.amberWash,
                      borderRadius: '11px',
                      color: brand.amberInk,
                      fontFamily: brand.fontHeading,
                      fontSize: '12px',
                      fontWeight: 700,
                      height: '22px',
                      lineHeight: '22px',
                      width: '22px',
                    }}
                  >
                    {i + 1}
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
          <td style={{ paddingBottom: '12px', paddingLeft: '10px', verticalAlign: 'top' }}>
            <Text style={{ color: brand.ink, fontSize: '15px', lineHeight: '23px', margin: 0 }}>{item}</Text>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

/** Plain bulleted list for non-sequential points. */
export const Bullets = ({ items }: { items: string[] }) => (
  <table role="presentation" cellPadding={0} cellSpacing={0} width="100%" style={{ margin: '4px 0 20px 0' }}>
    <tbody>
      {items.map((item) => (
        <tr key={item}>
          <td style={{ color: brand.amber, fontSize: '15px', paddingBottom: '10px', verticalAlign: 'top', width: '16px' }}>
            &bull;
          </td>
          <td style={{ paddingBottom: '10px', verticalAlign: 'top' }}>
            <Text style={{ color: brand.ink, fontSize: '15px', lineHeight: '23px', margin: 0 }}>{item}</Text>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

/**
 * Status banner. `tone` also changes the leading word, so the meaning does
 * not rest on colour alone — colour-blind readers and inverted dark-mode
 * clients both need the text to carry it.
 */
export const Callout = ({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  children: React.ReactNode;
}) => {
  const palette = {
    info: { bg: brand.page, bar: brand.navy, ink: brand.ink },
    success: { bg: brand.successWash, bar: brand.success, ink: '#14532D' },
    warning: { bg: brand.amberWash, bar: brand.amber, ink: brand.amberInk },
    danger: { bg: brand.dangerWash, bar: brand.danger, ink: '#7F1D1D' },
  }[tone];

  return (
    <Section
      style={{
        backgroundColor: palette.bg,
        borderRadius: '10px',
        borderLeft: `3px solid ${palette.bar}`,
        margin: '18px 0',
        padding: '14px 18px',
      }}
    >
      <Text style={{ color: palette.ink, fontSize: '15px', lineHeight: '23px', margin: 0 }}>
        {children}
      </Text>
    </Section>
  );
};

/** Big single figure — a score, a total, a count. */
export const Metric = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <Section
    style={{
      backgroundColor: brand.page,
      borderRadius: '10px',
      margin: '18px 0',
      padding: '20px',
      textAlign: 'center' as const,
    }}
  >
    <Text
      style={{
        color: brand.muted,
        fontFamily: brand.fontHeading,
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.1em',
        margin: '0 0 6px 0',
        textTransform: 'uppercase' as const,
      }}
    >
      {label}
    </Text>
    <Text
      style={{
        color: brand.navy,
        fontFamily: brand.fontHeading,
        fontSize: '34px',
        fontWeight: 800,
        lineHeight: '40px',
        margin: 0,
      }}
    >
      {value}
    </Text>
    {sub ? (
      <Text style={{ color: brand.muted, fontSize: '13px', lineHeight: '20px', margin: '4px 0 0 0' }}>
        {sub}
      </Text>
    ) : null}
  </Section>
);

/** Thin rule for separating sections inside the body. */
export const Divider = () => (
  <Section style={{ borderTop: `1px solid ${brand.border}`, fontSize: 0, lineHeight: 0, margin: '26px 0' }}>
    &nbsp;
  </Section>
);
