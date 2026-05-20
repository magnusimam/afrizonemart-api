import { createHash } from 'node:crypto';
import { env } from '@/config/env';
import { logger } from '@/infra/logger';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { LocalDiskStorage } from '@/modules/uploads/storage/local-disk';
import { R2Storage } from '@/modules/uploads/storage/r2';
import type { UploadStorage } from '@/modules/uploads/storage/types';
import { sniffImageMime } from '@/modules/uploads/sniff';
import { CloudflareImagesProvider, hasAlphaChannel } from './providers/cloudflare-images';
import { NoopProvider } from './providers/noop';
import { RemoveBgProvider } from './providers/remove-bg';
import type { BackgroundRemovalProvider } from './providers/types';

/**
 * Share-image cutout service.
 *
 * The "Share as image" feature wants a transparent-background PNG of
 * the product so the storefront's satori composite can drop it onto a
 * branded backdrop. We cache every cutout in R2 keyed by SHA-256 of
 * the original image URL — cheap forever-cache, no Prisma schema
 * change (deterministic key + R2 HEAD is enough to dedupe).
 *
 * Flow on `getOrCreateCutout(slug)`:
 *   1. Resolve the product by slug, grab `images[0]` as the source.
 *   2. Compute key = `cutouts/sha256(imageUrl).png`.
 *   3. HEAD the public R2/local URL for that key. 200 → cache hit,
 *      return existing URL.
 *   4. Cache miss → download the original, hand it to the provider,
 *      write the result to R2, return the new URL.
 *   5. If the provider throws (rare — network, quota, malformed
 *      image), fall back to the noop provider. The share image still
 *      ships, just without the floating-product look.
 *
 * The provider is picked at module load time based on env:
 *   - `REMOVE_BG_API_KEY` set → RemoveBgProvider (paid, best quality).
 *   - Otherwise              → NoopProvider (free pass-through).
 */

let providerInstance: BackgroundRemovalProvider | null = null;
function provider(): BackgroundRemovalProvider {
  if (providerInstance) return providerInstance;
  if (env.CF_TRANSFORM_DOMAIN) {
    providerInstance = new CloudflareImagesProvider(env.CF_TRANSFORM_DOMAIN);
  } else if (env.REMOVE_BG_API_KEY) {
    providerInstance = new RemoveBgProvider(env.REMOVE_BG_API_KEY);
  } else {
    providerInstance = new NoopProvider();
  }
  return providerInstance;
}

let storageInstance: UploadStorage | null = null;
function storage(): UploadStorage {
  if (storageInstance) return storageInstance;
  if (env.UPLOADS_BACKEND === 'r2') {
    if (
      !env.R2_ACCOUNT_ID ||
      !env.R2_ACCESS_KEY_ID ||
      !env.R2_SECRET_ACCESS_KEY ||
      !env.R2_BUCKET ||
      !env.R2_PUBLIC_URL_BASE
    ) {
      throw new Error(
        'UPLOADS_BACKEND=r2 but one of R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET / R2_PUBLIC_URL_BASE is missing.',
      );
    }
    storageInstance = new R2Storage({
      accountId: env.R2_ACCOUNT_ID,
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      bucket: env.R2_BUCKET,
      publicUrlBase: env.R2_PUBLIC_URL_BASE,
    });
  } else {
    storageInstance = new LocalDiskStorage(
      env.UPLOADS_LOCAL_DIR,
      env.UPLOADS_PUBLIC_URL_BASE,
    );
  }
  return storageInstance;
}

function cutoutPublicUrl(key: string): string {
  const base =
    env.UPLOADS_BACKEND === 'r2' && env.R2_PUBLIC_URL_BASE
      ? env.R2_PUBLIC_URL_BASE.replace(/\/$/, '')
      : env.UPLOADS_PUBLIC_URL_BASE.replace(/\/$/, '');
  return `${base}/${key}`;
}

/**
 * Cache-hit validation.
 *
 * Audit 2026-05-19 found that some cached cutouts in R2 are actually
 * the original image re-encoded as plain RGB PNG (no alpha) —
 * Cloudflare's segment=foreground silently failed for products with
 * complex backgrounds and we cached the response without checking
 * whether segmentation actually ran. The fix in
 * `CloudflareImagesProvider` prevents future bad writes, but existing
 * cache objects need to be invalidated.
 *
 * Strategy: when we detect a cache hit, ALSO Range-fetch the first
 * ~8KB of the cached PNG and run the same `hasAlphaChannel` check
 * the provider now uses. If the bytes have no real transparency,
 * we treat the cache as missing — the request falls through to the
 * cache-miss branch which re-runs the provider (now with validation),
 * regenerates a correct cutout (or falls back to noop on failure),
 * and overwrites the bad cache object at the same R2 key.
 *
 * 8KB is enough to capture: PNG signature (8) + IHDR chunk (25) +
 * optional sBIT/sRGB/iCCP/PLTE chunks + the tRNS chunk for palette
 * PNGs (must precede IDAT). Real-world tRNS chunks always land
 * well inside the first KB. We accept the tiny request as the cost
 * of correctness; cache hits stay sub-100ms.
 */
async function urlIsLive(
  url: string,
): Promise<{ live: boolean; valid: boolean }> {
  try {
    const res = await fetch(url, {
      headers: { Range: 'bytes=0-8191' },
    });
    // 200 (server didn't honour Range) or 206 (Partial Content) both
    // mean the object exists; anything else is a miss.
    if (res.status !== 200 && res.status !== 206) {
      return { live: false, valid: false };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { live: true, valid: hasAlphaChannel(buf) };
  } catch {
    return { live: false, valid: false };
  }
}

export interface CutoutResult {
  /// Public URL of the cutout PNG (or original image if Noop).
  url: string;
  /// True when the URL is the unmodified original image.
  isOriginal: boolean;
  /// Provider name that produced this cutout, for observability.
  provider: string;
  /// True when this response was served from the R2 cache rather
  /// than a fresh provider call.
  cached: boolean;
}

export async function getOrCreateCutoutForSlug(
  slug: string,
  opts: { force?: boolean } = {},
): Promise<CutoutResult> {
  const product = await prisma.product.findUnique({
    where: { slug },
    select: { id: true, name: true, images: true },
  });
  if (!product) throw HttpError.notFound('Product not found.');
  const sourceUrl = product.images?.[0];
  if (!sourceUrl) {
    throw HttpError.badRequest('Product has no image to generate a share card from.');
  }

  const hash = createHash('sha256').update(sourceUrl).digest('hex').slice(0, 32);
  const key = `cutouts/${hash}.png`;
  const cachedUrl = cutoutPublicUrl(key);

  // `force=1` skips the cache-hit short-circuit so the caller can
  // re-run removal after switching providers (e.g. NoopProvider →
  // RemoveBgProvider once REMOVE_BG_API_KEY is set in env). The
  // re-generated cutout overwrites the cached object at the same R2
  // key, so subsequent normal requests pick up the new version
  // automatically.
  if (!opts.force) {
    const probe = await urlIsLive(cachedUrl);
    if (probe.live && probe.valid) {
      return {
        url: cachedUrl,
        isOriginal: false,
        provider: 'cache',
        cached: true,
      };
    }
    if (probe.live && !probe.valid) {
      // Cached but no alpha channel — this is the audit-2026-05-19
      // case (Cloudflare returned a no-alpha PNG and we cached it).
      // Fall through to the regenerate branch below; the result will
      // overwrite the bad cache object at the same key.
      logger.warn('share_image.cache_invalid_regenerating', {
        slug,
        cachedUrl,
      });
    }
  }

  // Cache miss — fetch the original, send to the removal provider,
  // upload the result. Any failure along the way falls back to
  // returning the original URL so the share-image route can still
  // composite a card.
  try {
    const originalRes = await fetch(sourceUrl);
    if (!originalRes.ok) {
      throw new Error(`Failed to fetch original image: ${originalRes.status}`);
    }
    const originalBuffer = Buffer.from(await originalRes.arrayBuffer());
    const sniffed = sniffImageMime(originalBuffer) ?? 'image/jpeg';

    const p = provider();
    const result = await p.remove({
      buffer: originalBuffer,
      contentType: sniffed,
      sourceUrl,
    });

    // Even for Noop, we cache the original under the cutouts/ key so
    // subsequent share-image requests skip the round-trip back to the
    // source CDN.
    const put = await storage().put(key, result.buffer, result.contentType);

    logger.info('share_image.cutout_generated', {
      slug,
      provider: result.provider,
      isOriginal: result.isOriginal,
      bytes: result.buffer.byteLength,
    });

    return {
      url: put.url,
      isOriginal: result.isOriginal,
      provider: result.provider,
      cached: false,
    };
  } catch (err) {
    logger.warn('share_image.cutout_failed', {
      slug,
      error: err instanceof Error ? err.message : String(err),
    });
    // Last-resort fallback: return the original source URL. The
    // satori composite handles this case gracefully.
    return {
      url: sourceUrl,
      isOriginal: true,
      provider: 'fallback-source',
      cached: false,
    };
  }
}
