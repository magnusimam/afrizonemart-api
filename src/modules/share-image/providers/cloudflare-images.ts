import type {
  BackgroundRemovalInput,
  BackgroundRemovalProvider,
  BackgroundRemovalResult,
} from './types';

/**
 * Cloudflare Images Transform provider — uses the `segment=foreground`
 * URL transformation on a Cloudflare zone (BiRefNet model running on
 * Workers AI under the hood, exposed via the cdn-cgi/image endpoint).
 *
 * Pricing (as of 2026-05): 5,000 unique transformations/month free,
 * then $0.50 per 1,000. For a ~1k SKU catalog where each product is
 * cut out once and the result cached forever in R2, this is
 * effectively free.
 *
 * Setup:
 *   1. Enable Image Transformations on the Cloudflare zone that
 *      hosts the transform URL (typically `afrizonemart.com` or
 *      `images.afrizonemart.com`). Dashboard → Speed →
 *      Optimization → Image Transformations toggle.
 *   2. Set `CF_TRANSFORM_DOMAIN` env to that zone's hostname.
 *
 * No API key required — the cdn-cgi/image path is served by
 * Cloudflare's edge, auth is implicit because the zone owner
 * configured the feature.
 *
 * The URL pattern is:
 *   https://<domain>/cdn-cgi/image/segment=foreground,format=png/<source-url>
 *
 * Cloudflare fetches the source URL itself, runs the segmentation
 * model, and returns a transparent PNG. We just fetch the transform
 * URL and write the response buffer to R2 at our usual cache key.
 */
export class CloudflareImagesProvider implements BackgroundRemovalProvider {
  readonly name = 'cloudflare-images';
  private transformDomain: string;

  constructor(transformDomain: string) {
    // Strip protocol if accidentally included; normalise trailing
    // slash so URL building doesn't double them up.
    this.transformDomain = transformDomain
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');
  }

  async remove(input: BackgroundRemovalInput): Promise<BackgroundRemovalResult> {
    // The source URL is appended after the transform options. CF does
    // NOT want the source URL-encoded — it parses the path itself.
    const transformUrl =
      `https://${this.transformDomain}/cdn-cgi/image/` +
      `segment=foreground,format=png,fit=scale-down,width=1200` +
      `/${input.sourceUrl}`;

    const res = await fetch(transformUrl);
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        `Cloudflare Images transform responded ${res.status}: ${detail.slice(0, 200)}`,
      );
    }

    // Sanity check the response is actually an image — if Image
    // Transformations isn't enabled on the zone, the response might
    // be an HTML error page from CF, which we definitely don't want
    // to cache.
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      throw new Error(
        `Cloudflare Images transform returned non-image content-type "${contentType}". ` +
          `Is Image Transformations enabled on ${this.transformDomain}?`,
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);

    // **Critical validation** — Cloudflare's segment=foreground will
    // happily return HTTP 200 + image/png even when the segmentation
    // model couldn't separate the foreground (busy backgrounds,
    // low-contrast products, model didn't load, zone doesn't have
    // Cloudflare Images enabled, etc.). The output in that case is
    // the **original image re-encoded as plain RGB PNG with no alpha
    // channel** — we'd then cache that as if it were a cutout and the
    // storefront's FloatingProduct path would render the original
    // background floating awkwardly on the navy backdrop. (Audit
    // 2026-05-19: Golden Penny Semovita was a textbook example —
    // 0.0% transparent pixels, colorType=2 RGB.)
    //
    // Cheap heuristic: PNGs from a real segmentation are always
    // either colorType 6 (RGBA) or colorType 3 (palette, with tRNS
    // chunk — CF picks palette encoding precisely because the
    // transparent regions compress well that way). A plain RGB PNG
    // (colorType 2) or grayscale (colorType 0) means segmentation
    // didn't actually run. Reject and let the service fall back to
    // NoopProvider — the storefront renders InsetProduct (white
    // panel) for those products, which looks intentional rather than
    // broken.
    if (!hasAlphaChannel(buf)) {
      throw new Error(
        `Cloudflare returned a no-alpha PNG for ${input.sourceUrl} — ` +
          `segmentation likely failed silently. Falling back.`,
      );
    }

    return {
      buffer: buf,
      contentType: 'image/png',
      isOriginal: false,
      provider: this.name,
    };
  }
}

/**
 * Cheap PNG transparency check using only the IHDR + chunk header
 * names — no PNG decoder needed.
 *
 * - PNG signature is 8 bytes at offset 0.
 * - IHDR chunk starts at byte 8; color type lives at byte 25.
 * - colorType 6 = RGBA (alpha plane) → has transparency.
 * - colorType 4 = grayscale + alpha → has transparency.
 * - colorType 3 = palette → may have transparency via tRNS chunk;
 *   we scan the buffer for the literal 'tRNS' chunk-type marker.
 *   Cloudflare's segment=foreground always emits tRNS when palette
 *   encoded — without it, the palette encoding wouldn't be more
 *   compact than RGB and CF would have chosen colorType 6 instead.
 * - colorType 0/2 = grayscale/RGB without alpha → no transparency
 *   possible.
 *
 * Exported for use by the service's cache-hit revalidation path.
 */
export function hasAlphaChannel(buf: Buffer): boolean {
  if (buf.length < 33) return false;
  // PNG magic: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] !== 0x89 ||
    buf[1] !== 0x50 ||
    buf[2] !== 0x4e ||
    buf[3] !== 0x47
  ) {
    return false;
  }
  const colorType = buf[25];
  if (colorType === 6 || colorType === 4) return true;
  if (colorType === 3) {
    // Look for the 'tRNS' chunk-type marker (4 ASCII bytes). It
    // sits inside the first few KB of every palette PNG that has
    // alpha. Using Buffer.indexOf is O(n) but n is tiny here.
    return buf.indexOf(Buffer.from('tRNS', 'ascii')) !== -1;
  }
  return false;
}
