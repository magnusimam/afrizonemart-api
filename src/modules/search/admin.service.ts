import { prisma } from '@/infra/prisma';
import type { SearchStatsQuery } from './admin.schema';

/**
 * Admin search-quality dashboard (Phase 0 "p95 < 200ms" and "zero-
 * result rate < 5%" checklist items — see ALGORITHM_SYSTEMS_TRACKER.md,
 * "Search ranking & relevance"). Both metrics were previously "not yet
 * measured (no production traffic on the new endpoint yet)" — this is
 * the self-serve instrumentation to actually check them once traffic
 * exists, not a claim that they're currently passing.
 */

interface SearchStatsResult {
  rangeDays: number;
  since: string;
  totalQueries: number;
  zeroResultQueries: number;
  zeroResultRate: number;
  /// Null when no query in the window has a logged duration yet
  /// (e.g. immediately after the Phase 1 migration, before any new
  /// traffic lands).
  latencyMs: { p50: number; p95: number; p99: number } | null;
  fallbackRate: number;
  didYouMeanRate: number;
  scriptDistribution: Array<{ script: string; count: number }>;
  topZeroResultQueries: Array<{ normalizedQuery: string; count: number }>;
}

export async function getSearchStatsService(q: SearchStatsQuery): Promise<SearchStatsResult> {
  const since = new Date(Date.now() - q.days * 24 * 60 * 60 * 1000);

  const [totals, fallbackCount, didYouMeanCount, latencyRows, scriptRows, topZeroRows] = await Promise.all([
    prisma.searchQueryLog.aggregate({
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.searchQueryLog.count({ where: { createdAt: { gte: since }, usedFallback: true } }),
    prisma.searchQueryLog.count({ where: { createdAt: { gte: since }, didYouMeanShown: true } }),
    prisma.$queryRawUnsafe<Array<{ p50: number | null; p95: number | null; p99: number | null }>>(
      `
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY "durationMs") AS p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY "durationMs") AS p95,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY "durationMs") AS p99
      FROM "SearchQueryLog"
      WHERE "createdAt" >= $1 AND "durationMs" IS NOT NULL
      `,
      since,
    ),
    prisma.$queryRawUnsafe<Array<{ script: string | null; count: bigint }>>(
      `
      SELECT script, COUNT(*)::bigint AS count
      FROM "SearchQueryLog"
      WHERE "createdAt" >= $1
      GROUP BY script
      ORDER BY count DESC
      `,
      since,
    ),
    prisma.$queryRawUnsafe<Array<{ normalizedQuery: string; count: bigint }>>(
      `
      SELECT "normalizedQuery", COUNT(*)::bigint AS count
      FROM "SearchQueryLog"
      WHERE "createdAt" >= $1 AND "resultCount" = 0
      GROUP BY "normalizedQuery"
      ORDER BY count DESC
      LIMIT 20
      `,
      since,
    ),
  ]);

  const zeroResultQueries = await prisma.searchQueryLog.count({
    where: { createdAt: { gte: since }, resultCount: 0 },
  });
  const totalQueries = totals._count._all;

  const latency = latencyRows[0];

  return {
    rangeDays: q.days,
    since: since.toISOString(),
    totalQueries,
    zeroResultQueries,
    zeroResultRate: totalQueries > 0 ? zeroResultQueries / totalQueries : 0,
    latencyMs:
      latency && latency.p50 !== null
        ? {
            p50: Math.round(latency.p50),
            p95: Math.round(latency.p95 ?? latency.p50),
            p99: Math.round(latency.p99 ?? latency.p50),
          }
        : null,
    fallbackRate: totalQueries > 0 ? fallbackCount / totalQueries : 0,
    didYouMeanRate: totalQueries > 0 ? didYouMeanCount / totalQueries : 0,
    scriptDistribution: scriptRows.map((r) => ({
      script: r.script ?? 'unknown',
      count: Number(r.count),
    })),
    topZeroResultQueries: topZeroRows.map((r) => ({
      normalizedQuery: r.normalizedQuery,
      count: Number(r.count),
    })),
  };
}
