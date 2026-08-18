/**
 * Brand tokens reused across every email template. Keep these aligned
 * with the storefront tailwind theme so emails feel like an extension of
 * the site, not a separate product.
 */
export const brand = {
  navy: '#000066',
  /// Lifted navy for small text and links — #000066 on white is very dark and
  /// loses its hue at 13–14px; this reads as the same brand colour but stays
  /// legible at caption sizes.
  navySoft: '#2B2B8F',
  amber: '#FBAC34',
  /// Amber is a mid-tone: it fails contrast as text on white. Use this darker
  /// mix for eyebrows and any amber wording, and keep #FBAC34 for fills.
  amberInk: '#8A5A00',
  amberWash: '#FFF6E8',

  /// Body copy. Pure black reads harsh and, worse, gives dark-mode clients
  /// nothing to invert toward; a near-black grey degrades gracefully.
  ink: '#1F2937',
  inkSoft: '#4B5563',
  muted: '#6B7280',
  /// Former name for `ink`, kept so the shopper-side templates (OrderConfirmed,
  /// render-blocks) don't need touching for a supplier-side redesign.
  charcoal: '#1F2937',

  border: '#E5E7EB',
  /// Slightly cool off-white — a pure grey page behind a white card reads as
  /// unfinished, this reads as chosen.
  page: '#F6F7FB',
  white: '#FFFFFF',

  success: '#16A34A',
  successWash: '#F0FDF4',
  danger: '#DC2626',
  dangerWash: '#FEF2F2',

  fontHeading:
    "'Raleway', 'Segoe UI', -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif",
  fontBody:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",

  /**
   * The wordmark is navy artwork on a transparent background, so it MUST sit
   * on a light surface. It previously sat on the navy header and was
   * invisible — navy on navy. (An earlier fix pointed at /logo-light.png,
   * which 404s in production; the header is light instead.)
   *
   * Intrinsic size is 360×120 (3:1). Render at 180×60 to keep that ratio —
   * the old 160×32 squashed it.
   */
  logoUrl: 'https://afrizonemart.com/images/logo.png',
  logoWidth: 180,
  logoHeight: 60,

  siteUrl: 'https://afrizonemart.com',
  supportEmail: 'support@afrizonemart.com',
  supplierEmail: 'suppliers@afrizonemart.com',
} as const;

export function formatNGN(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(amount);
}
