import { logger } from '@/infra/logger';
import { Sentry } from '@/infra/sentry';
import { deleteImage } from './service';

/**
 * Best-effort R2 cleanup helpers.
 *
 * `deleteImagesByUrl()` is the single entry point used by every
 * caller that wants to clean up storage when a DB row that
 * referenced an image goes away (product delete, intern resubmit
 * after rejection, etc).
 *
 * Three properties matter here:
 *
 *  1. **Never throw.** R2 failures must not fail the surrounding
 *     DB operation. The DB is the source of truth; an orphan file
 *     is a cost issue, not a correctness one. The monthly
 *     orphan-scan cron is the safety net.
 *
 *  2. **Parallel batch.** R2 deletes are independent — issuing
 *     them sequentially would multiply latency on a product with
 *     5+ image references.
 *
 *  3. **Filter to our hosts only.** A product's image list could
 *     in theory contain a hot-linked URL from an old import. We
 *     match against our known upload folders so a stray external
 *     URL doesn't cause `urlToKey` to return something nonsensical.
 */

/// The folder allowlist mirrors `service.ts:ALLOWED_FOLDERS`. We
/// extract the suffix `/<folder>/<filename>` from the URL.
const KEY_PATTERN = /\/(products|categories|about|reviews|sellers|misc)\/([^/?#]+)$/;

/// Convert a public image URL to the underlying storage key, or null
/// if the URL doesn't look like one of ours. Tolerant of differences
/// between R2 (`https://images.afrizonemart.com/products/<id>.png`),
/// local dev (`http://localhost:4000/uploads/products/<id>.png`),
/// and legacy R2 dev URLs (`https://<bucket>.<acct>.r2.dev/...`) —
/// we only care about the folder + filename tail.
export function urlToKey(url: string): string | null {
  const match = KEY_PATTERN.exec(url);
  if (!match) return null;
  return `${match[1]}/${match[2]}`;
}

export interface CleanupResult {
  deleted: number;
  failed: number;
  skipped: number;
}

export async function deleteImagesByUrl(
  urls: Array<string | null | undefined>,
): Promise<CleanupResult> {
  const keys: string[] = [];
  let skipped = 0;
  for (const raw of urls) {
    if (typeof raw !== 'string' || raw.length === 0) continue;
    const key = urlToKey(raw);
    if (key === null) {
      skipped++;
      continue;
    }
    keys.push(key);
  }

  // De-duplicate — a brand logo URL can legitimately repeat across
  // multiple submission rows for the same product.
  const unique = Array.from(new Set(keys));

  if (unique.length === 0) {
    return { deleted: 0, failed: 0, skipped };
  }

  let deleted = 0;
  let failed = 0;

  await Promise.all(
    unique.map(async (key) => {
      try {
        await deleteImage(key);
        deleted++;
      } catch (err) {
        failed++;
        logger.warn('uploads.cleanup_failed', {
          key,
          error: err instanceof Error ? err.message : String(err),
        });
        Sentry.captureException(err, {
          tags: { area: 'uploads.cleanup' },
          extra: { key },
        });
      }
    }),
  );

  if (deleted > 0 || failed > 0) {
    logger.info('uploads.cleanup_done', {
      deleted,
      failed,
      skipped,
      attempted: unique.length,
    });
  }

  return { deleted, failed, skipped };
}

/// Convenience — collect every image URL referenced by a product
/// and all its submissions. Caller passes the result to
/// `deleteImagesByUrl`. Exposed here so the orphan-scan cron can
/// reuse the same field-list when building the referenced set.
export interface ProductImageRefs {
  /// From Product.images[]
  productImages: string[];
  /// From Product.brandImageUrl
  productBrandImage: string | null;
  /// Flat list of every URL across every submission row
  submissionUrls: string[];
}
