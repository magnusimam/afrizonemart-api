/**
 * Brand tokens reused across every email template. Keep these aligned
 * with the storefront tailwind theme so emails feel like an extension of
 * the site, not a separate product.
 */
export const brand = {
  navy: '#000066',
  amber: '#FBAC34',
  charcoal: '#1F2937',
  muted: '#6B7280',
  border: '#E5E7EB',
  page: '#F8FAFC',
  white: '#FFFFFF',
  success: '#16A34A',
  danger: '#DC2626',
  fontHeading:
    "'Raleway', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  fontBody:
    "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  logoUrl: 'https://afrizonemart.com/logo-light.png',
  siteUrl: 'https://afrizonemart.com',
  supportEmail: 'support@afrizonemart.com',
} as const;

export function formatNGN(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(amount);
}
