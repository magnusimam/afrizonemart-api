/**
 * Phase 11.3 (audit H8) — magic-byte sniffer for the upload module.
 *
 * The client's `Content-Type` header is attacker-controlled — uploading
 * `<script>...</script>` with `Content-Type: image/png` would slip past
 * the MIME-only validator and end up served as `image/png` from R2,
 * with a real risk of MIME-sniffing bypass on the receiving browser.
 *
 * We sniff the FIRST FEW BYTES of the buffer and only accept files
 * whose magic header matches a known image format. The detected MIME
 * is then used both for the storage `Content-Type` and for the file
 * extension — never the client header.
 *
 * Covers the same formats as `ALLOWED_MIME`: JPEG, PNG, WebP, AVIF, GIF.
 *
 * Why not the `file-type` npm module: it's ESM-only since v17 and the
 * API is CJS. A dependency bump would force a tsconfig-wide migration
 * for one feature; a 40-line sniffer is the better tradeoff.
 */

export type SniffedImageMime =
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/avif'
  | 'image/gif';

/**
 * Returns the detected MIME or null if the buffer doesn't match a
 * supported image format. Reads up to the first 16 bytes — anything
 * beyond is irrelevant for the supported formats.
 */
export function sniffImageMime(buf: Buffer): SniffedImageMime | null {
  if (buf.length < 4) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }

  // GIF: ASCII "GIF8" then 7a or 9a
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  ) {
    return 'image/gif';
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'image/webp';
  }

  // AVIF / HEIF family: bytes 4..7 = "ftyp", bytes 8..11 in {avif, avis,
  // heic, mif1, msf1}. We only trust pure AVIF for now.
  if (
    buf.length >= 12 &&
    buf[4] === 0x66 && // f
    buf[5] === 0x74 && // t
    buf[6] === 0x79 && // y
    buf[7] === 0x70 // p
  ) {
    const brand = buf.toString('ascii', 8, 12).toLowerCase();
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
  }

  return null;
}
