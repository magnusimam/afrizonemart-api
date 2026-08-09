/**
 * PDF sibling of `sniff.ts` (Phase 11.3 audit H8 posture) — never trust
 * the client's `Content-Type` header. Same magic-byte approach: the
 * PDF spec requires the file to start with `%PDF-` (0x25 0x50 0x44
 * 0x46 0x2D), optionally preceded by a byte-order mark some scanners
 * add. Good enough for our allowlist (we don't need to parse the PDF
 * version or validate the trailer).
 */
export function sniffPdfMime(buf: Buffer): 'application/pdf' | null {
  if (buf.length < 5) return null;
  const header = buf.subarray(0, 5).toString('ascii');
  return header === '%PDF-' ? 'application/pdf' : null;
}
