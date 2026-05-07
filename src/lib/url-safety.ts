import { isIP } from 'node:net';
import { promises as dns } from 'node:dns';
import { logger } from '@/infra/logger';

/**
 * Phase 11.3 (audit H5) — SSRF guard for outbound URLs the platform
 * fetches based on admin input.
 *
 * Used by:
 *  - webhooks: admin-registered receiver URLs
 *  - (future) any other place that POSTs to a URL derived from user
 *    input
 *
 * What it blocks:
 *  - Loopback: 127.0.0.0/8, ::1
 *  - Link-local + cloud metadata: 169.254.0.0/16 (AWS / GCP / Railway
 *    metadata service lives here — leaking responses to it can dump
 *    credentials)
 *  - RFC1918 private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
 *  - IPv6 unique local: fc00::/7, fe80::/10
 *  - Internal DNS suffixes: *.internal, *.local, *.localhost
 *  - Non-http(s) schemes (file:, gopher:, etc.)
 *
 * Two stages because DNS results can change between save and
 * dispatch (a domain could resolve to a public IP at registration
 * and a private IP later). The dispatcher MUST re-check.
 */

const BLOCKED_HOSTNAME_SUFFIXES = ['.internal', '.local', '.localhost'];
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
]);

interface ValidateOptions {
  /// Block private + loopback IPs. Default true.
  blockPrivateIps?: boolean;
  /// Allow only http/https. Default true.
  httpOnly?: boolean;
}

export interface UrlSafetyError {
  reason: string;
  url: string;
}

/**
 * Quick-pass validation that runs synchronously without DNS. Use at
 * admin-save time alongside the async `assertUrlIsPublic` for a full
 * check.
 */
export function isUrlSchemeAndHostnameSafe(
  url: string,
  options: ValidateOptions = {},
): UrlSafetyError | null {
  const { httpOnly = true } = options;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { reason: 'Invalid URL', url };
  }

  if (httpOnly && parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { reason: `Disallowed scheme "${parsed.protocol}"`, url };
  }

  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    return { reason: `Disallowed hostname "${host}"`, url };
  }
  for (const suffix of BLOCKED_HOSTNAME_SUFFIXES) {
    if (host.endsWith(suffix)) {
      return { reason: `Disallowed hostname suffix "${suffix}"`, url };
    }
  }

  // Reject literal IPs in private ranges right away — saves a DNS
  // lookup. DNS-resolved IPs are still checked by `assertUrlIsPublic`.
  const ipKind = isIP(host);
  if (ipKind > 0) {
    if (isPrivateOrLoopbackIp(host)) {
      return { reason: `Disallowed IP literal "${host}"`, url };
    }
  }

  return null;
}

/**
 * Full check: scheme + hostname syntax + DNS-resolved IPs. Throws on
 * any block. Call this from the dispatcher right before fetch — DNS
 * results can change between admin-save and runtime dispatch.
 */
export async function assertUrlIsPublic(url: string): Promise<void> {
  const synthetic = isUrlSchemeAndHostnameSafe(url);
  if (synthetic) {
    throw new Error(`SSRF guard: ${synthetic.reason}`);
  }

  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase();
  if (isIP(host) > 0) return; // already validated above

  let addrs: string[];
  try {
    const records = await dns.lookup(host, { all: true });
    addrs = records.map((r) => r.address);
  } catch (err) {
    // DNS failure → don't fetch; better to fail closed.
    logger.warn('ssrf_guard.dns_failed', {
      host,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error(`SSRF guard: DNS lookup failed for "${host}"`);
  }

  for (const addr of addrs) {
    if (isPrivateOrLoopbackIp(addr)) {
      throw new Error(`SSRF guard: hostname "${host}" resolves to private IP ${addr}`);
    }
  }
}

/**
 * IP literal classifier. Handles IPv4 + a basic IPv6 set (loopback,
 * link-local, unique local). IPv6 mapped IPv4 (`::ffff:127.0.0.1`)
 * is folded back to v4 before checking.
 */
export function isPrivateOrLoopbackIp(addr: string): boolean {
  // ::ffff:1.2.3.4 → 1.2.3.4
  const v4Mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4Mapped) return isPrivateOrLoopbackIp(v4Mapped[1]);

  if (isIP(addr) === 4) {
    const [a, b] = addr.split('.').map(Number);
    if (a === 10) return true;
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 169 && b === 254) return true; // link-local + metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 0) return true; // 0.0.0.0/8 — non-routable
    return false;
  }

  if (isIP(addr) === 6) {
    const lower = addr.toLowerCase();
    if (lower === '::1') return true;
    if (lower === '::') return true;
    if (lower.startsWith('fe80:')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
    return false;
  }

  return false;
}
