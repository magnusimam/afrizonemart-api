/**
 * FX rates service.
 *
 * Caches a snapshot of NGN-to-X exchange rates in the generic
 * `Setting` table (key `fx.rates`). The free tier of
 * exchangerate-api.com gives ~1500 calls/month — well over the
 * once-per-24h we need. Falls back to a static "good enough"
 * snapshot if the upstream is down so the storefront never breaks.
 *
 * Usage is display-only for v1 launch — checkout still charges in
 * NGN. See ARCHITECTURE_TRACKER.md item #23 for the multi-currency
 * checkout path.
 */
import { prisma } from '@/infra/prisma';
import { logger } from '@/infra/logger';

const CACHE_KEY = 'fx.rates';
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

export interface FxSnapshot {
  base: string; // 'NGN'
  rates: Record<string, number>; // { USD: 0.00065, KES: 0.084, ... }
  fetchedAt: string; // ISO
}

/** Fallback rates anchored to a 2026-04 snapshot. Only used if the
 * upstream call fails AND we have no cached row yet. */
const FALLBACK: FxSnapshot = {
  base: 'NGN',
  rates: {
    NGN: 1,
    USD: 0.00065,
    EUR: 0.00060,
    GBP: 0.00051,
    KES: 0.084,
    GHS: 0.0098,
    ZAR: 0.012,
    XAF: 0.39,
    XOF: 0.39,
    UGX: 2.4,
    TZS: 1.7,
    RWF: 0.87,
    EGP: 0.032,
    MAD: 0.0064,
    CAD: 0.00089,
    AUD: 0.00099,
  },
  fetchedAt: '2026-04-26T00:00:00.000Z',
};

async function readCache(): Promise<FxSnapshot | null> {
  const row = await prisma.setting.findUnique({ where: { key: CACHE_KEY } });
  if (!row) return null;
  return row.value as unknown as FxSnapshot;
}

async function writeCache(snap: FxSnapshot): Promise<void> {
  await prisma.setting.upsert({
    where: { key: CACHE_KEY },
    create: { key: CACHE_KEY, value: snap as unknown as object },
    update: { value: snap as unknown as object },
  });
}

function isStale(snap: FxSnapshot): boolean {
  const age = Date.now() - new Date(snap.fetchedAt).getTime();
  return age > TTL_MS;
}

async function fetchUpstream(): Promise<FxSnapshot | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/NGN', {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      logger.warn('fx upstream non-200', { status: res.status });
      return null;
    }
    const json = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (json.result !== 'success' || !json.rates) {
      logger.warn('fx upstream bad payload', { result: json.result });
      return null;
    }
    return {
      base: 'NGN',
      rates: json.rates,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn('fx upstream fetch failed', { err: (err as Error).message });
    return null;
  }
}

let inflight: Promise<FxSnapshot> | null = null;

export async function getRates(): Promise<FxSnapshot> {
  const cached = await readCache();
  if (cached && !isStale(cached)) return cached;

  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const fresh = await fetchUpstream();
      if (fresh) {
        await writeCache(fresh);
        return fresh;
      }
      // Upstream failed — keep stale cache if we have one, else fallback.
      if (cached) return cached;
      return FALLBACK;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Convert a NGN amount to the target currency. Returns null if the
 * currency isn't in the snapshot. Returns NGN amount unchanged when
 * target === 'NGN'. */
export async function convertFromNgn(
  amountNgn: number,
  target: string,
): Promise<number | null> {
  const t = target.toUpperCase();
  if (t === 'NGN') return amountNgn;
  const snap = await getRates();
  const rate = snap.rates[t];
  if (typeof rate !== 'number') return null;
  return amountNgn * rate;
}
