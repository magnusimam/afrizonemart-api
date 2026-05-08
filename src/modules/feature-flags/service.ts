import { createHash } from 'node:crypto';
import type { FeatureFlag } from '@prisma/client';
import { prisma } from '@/infra/prisma';
import { logger } from '@/infra/logger';
import { FEATURE_FLAG_REGISTRY } from './registry';

/**
 * Phase 10.4 — Feature flag evaluation.
 *
 * A flag's `targetingRules` is an ordered array; the first rule whose
 * `match` clause matches the evaluation context wins. If no rule
 * matches, the flag's `defaultValue` is returned.
 *
 * Supported match keys:
 *  - `userId: string | string[]`     — exact user(s)
 *  - `userRole: string | string[]`   — CUSTOMER / ADMIN / SELLER
 *  - `country: string | string[]`    — 2-letter ISO from request
 *  - `rolloutPercent: number`        — sticky 0-100 hash bucket on userId
 *
 * Rules are evaluated server-side; the answer is sent to the client.
 */
export interface EvaluationContext {
  userId?: string;
  userRole?: string;
  country?: string;
}

interface TargetingRule {
  match: Record<string, unknown>;
  value: boolean;
}

const cache = new Map<string, { row: FeatureFlag; expires: number }>();
const CACHE_MS = 10_000;

async function load(key: string): Promise<FeatureFlag | null> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.row;
  const row = await prisma.featureFlag.findUnique({ where: { key } });
  if (row) cache.set(key, { row, expires: Date.now() + CACHE_MS });
  return row;
}

export function invalidateFlag(key: string): void {
  cache.delete(key);
}

export async function evaluateFlag(
  key: string,
  ctx: EvaluationContext,
): Promise<boolean> {
  const flag = await load(key);
  if (!flag || !flag.isActive) return flag?.defaultValue ?? false;

  const rules = (flag.targetingRules as unknown as TargetingRule[]) ?? [];
  for (const rule of rules) {
    if (matches(rule.match, ctx, flag.key)) return rule.value;
  }
  return flag.defaultValue;
}

export async function evaluateFlags(
  keys: string[],
  ctx: EvaluationContext,
): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  await Promise.all(
    keys.map(async (k) => {
      out[k] = await evaluateFlag(k, ctx);
    }),
  );
  return out;
}

function matches(
  match: Record<string, unknown>,
  ctx: EvaluationContext,
  flagKey: string,
): boolean {
  if (!match || typeof match !== 'object') return false;

  if ('userId' in match) {
    const m = toArray(match.userId);
    if (!ctx.userId || !m.includes(ctx.userId)) return false;
  }
  if ('userRole' in match) {
    const m = toArray(match.userRole);
    if (!ctx.userRole || !m.includes(ctx.userRole)) return false;
  }
  if ('country' in match) {
    const m = toArray(match.country);
    if (!ctx.country || !m.includes(ctx.country)) return false;
  }
  if ('rolloutPercent' in match) {
    const pct = Number(match.rolloutPercent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return false;
    if (!ctx.userId) return pct === 100; // anon users get all-or-nothing
    const bucket = stickyBucket(flagKey, ctx.userId);
    if (bucket >= pct) return false;
  }
  return true;
}

function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string') return [v];
  return [];
}

/**
 * Deterministic 0-99 bucket for a (flag, user) pair. Same user always
 * lands in the same bucket for the same flag — so a 10% rollout is
 * stable across requests.
 */
function stickyBucket(flagKey: string, userId: string): number {
  const h = createHash('sha256').update(`${flagKey}:${userId}`).digest();
  // First 4 bytes → uint32 → mod 100.
  const n = (h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3];
  return Math.abs(n) % 100;
}

logger.info('feature_flags.engine.loaded', { cacheTtlMs: CACHE_MS });

/**
 * Phase 10.4 (resilience pattern) — seed every code-registered flag
 * into the DB the first time the API boots after it lands. Idempotent
 * and insert-only: if an admin has already toggled or edited a flag,
 * we don't touch it. Result: every `useFlag('<key>')` in the codebase
 * is discoverable in `/admin/feature-flags` immediately on first
 * deploy without the engineer having to pre-create rows by hand.
 *
 * Returns a small `{ created, skipped }` summary for the boot logger.
 */
export async function seedRegisteredFlags(): Promise<{
  created: number;
  skipped: number;
}> {
  if (FEATURE_FLAG_REGISTRY.length === 0) return { created: 0, skipped: 0 };

  const keys = FEATURE_FLAG_REGISTRY.map((f) => f.key);
  const existing = await prisma.featureFlag.findMany({
    where: { key: { in: keys } },
    select: { key: true },
  });
  const have = new Set(existing.map((r) => r.key));

  const toCreate = FEATURE_FLAG_REGISTRY.filter((f) => !have.has(f.key));
  if (toCreate.length > 0) {
    await prisma.featureFlag.createMany({
      data: toCreate.map((f) => ({
        key: f.key,
        name: f.name,
        description: f.description,
        defaultValue: f.defaultValue,
        // isActive defaults to true at the schema level; targetingRules
        // defaults to []. Don't override either.
      })),
      // Race-tolerant: another instance booting at the same time
      // might insert ahead of us. unique violation on `key` is
      // expected.
      skipDuplicates: true,
    });
  }

  return {
    created: toCreate.length,
    skipped: FEATURE_FLAG_REGISTRY.length - toCreate.length,
  };
}
