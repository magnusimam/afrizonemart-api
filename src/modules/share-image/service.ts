import { createHash } from 'node:crypto';
import { env } from '@/config/env';
import { logger } from '@/infra/logger';
import { prisma } from '@/infra/prisma';
import { HttpError } from '@/middleware/error-handler';
import { LocalDiskStorage } from '@/modules/uploads/storage/local-disk';
import { R2Storage } from '@/modules/uploads/storage/r2';
import type { UploadStorage } from '@/modules/uploads/storage/types';
import { sniffImageMime } from '@/modules/uploads/sniff';
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
  if (env.REMOVE_BG_API_KEY) {
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

async function urlIsLive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
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

export async function getOrCreateCutoutForSlug(slug: string): Promise<CutoutResult> {
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

  if (await urlIsLive(cachedUrl)) {
    return {
      url: cachedUrl,
      isOriginal: false,
      provider: 'cache',
      cached: true,
    };
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
