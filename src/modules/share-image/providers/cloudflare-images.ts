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
    return {
      buffer: Buffer.from(arrayBuffer),
      contentType: 'image/png',
      isOriginal: false,
      provider: this.name,
    };
  }
}
