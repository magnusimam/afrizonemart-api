/**
 * Background-removal provider interface.
 *
 * The "Share as image" feature wants a transparent PNG of the product
 * floating on a branded backdrop. Generating that cutout is the
 * expensive bit (paid API call or local AI inference); compositing is
 * cheap. We keep providers pluggable so the cheap-vs-quality trade-off
 * can be flipped via env without touching the calling code.
 *
 * Implementations:
 *  - NoopProvider — returns the original buffer unchanged. Free.
 *    Used when no AI provider is configured.
 *  - RemoveBgProvider — calls remove.bg's API. Paid (~$0.20/image),
 *    best quality.
 *  - (Future) CloudflareWorkersAIProvider — uses CF Workers AI rmbg
 *    model. Cheap, in-network with R2.
 */
export interface BackgroundRemovalResult {
  /// PNG buffer to write to R2. For the noop provider this is the
  /// original buffer; for real providers it is a cutout PNG with
  /// alpha channel.
  buffer: Buffer;
  /// `image/png` for cutouts; the original content-type for noop.
  contentType: string;
  /// True when the buffer is the raw original image (no removal
  /// happened). The storefront uses this to decide whether to render
  /// the satori card with a "floating" composition or to inset the
  /// image inside the frosted card itself.
  isOriginal: boolean;
  /// Short string identifying which provider produced this result.
  /// Surfaces in logs and the cutout response payload.
  provider: string;
}

/**
 * Provider input. URL-based providers (Cloudflare Images Transform)
 * use `sourceUrl` to issue a CDN-side transform and never touch the
 * buffer. Binary-API providers (remove.bg) post the buffer as
 * multipart/form-data. The Noop provider just returns the buffer
 * unchanged. Callers always supply both so every provider can pick
 * the path it needs.
 */
export interface BackgroundRemovalInput {
  buffer: Buffer;
  contentType: string;
  sourceUrl: string;
}

export interface BackgroundRemovalProvider {
  readonly name: string;
  remove(input: BackgroundRemovalInput): Promise<BackgroundRemovalResult>;
}
