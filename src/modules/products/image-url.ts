/**
 * A `Product.images` entry must be a real http(s) URL — never a bare
 * filename or local path. `next/image` throws on anything else, and
 * the storefront's "hide products without a real photo" rule
 * (`repository.ts`'s `images: { isEmpty: false }` filter) relies on
 * this array accurately reflecting "has a photo" vs "doesn't."
 *
 * Shared by every path that can write `Product.images`:
 * `admin.schema.ts` (Zod `.url()` on the direct admin editor),
 * `admin.bulk.ts` (CSV import — filters rather than rejects, since
 * one bad column in one row shouldn't fail an otherwise-good batch),
 * and `product-submissions/service.ts` (intern full-product approval,
 * which calls `adminCreateProduct` directly rather than through the
 * Zod-validated HTTP boundary).
 */
export function isImageUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
