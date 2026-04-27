import { prisma } from '@/infra/prisma';
import { logger } from '@/infra/logger';

/**
 * Phase 10.5 — Business Rules engine.
 *
 * Each rule has `conditions` (a matcher tree) and `actions` (a free-form
 * object the host module interprets). When `evaluate(scope, ctx)` is
 * called we collect every active rule for the scope, evaluate its
 * conditions against `ctx`, and return matching rules in priority
 * order along with their merged action map.
 *
 * Condition DSL (kept tiny on purpose):
 *
 *   { "field": "value" }                  exact equality
 *   { "field": { "$eq": v } }             explicit eq
 *   { "field": { "$ne": v } }             not equal
 *   { "field": { "$gt": n } }             greater than
 *   { "field": { "$gte": n } }            greater than or equal
 *   { "field": { "$lt": n } }             less than
 *   { "field": { "$lte": n } }            less than or equal
 *   { "field": { "$in": [a, b] } }        membership
 *   { "$any": [{...}, {...}] }            OR — any sub-condition matches
 *   { "$all": [{...}, {...}] }            AND — every sub-condition matches
 *
 * Field paths support dotted access — `cart.subtotal`, `user.country`.
 *
 * Empty conditions `{}` always match (good for default/fallback rules).
 */

export interface RuleHit {
  id: string;
  key: string;
  name: string;
  priority: number;
  actions: Record<string, unknown>;
}

const cache = new Map<string, { rows: Awaited<ReturnType<typeof prisma.businessRule.findMany>>; expires: number }>();
const CACHE_MS = 15_000;

async function loadRules(scope: string) {
  const hit = cache.get(scope);
  if (hit && hit.expires > Date.now()) return hit.rows;
  const rows = await prisma.businessRule.findMany({
    where: { scope, isActive: true },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
  cache.set(scope, { rows, expires: Date.now() + CACHE_MS });
  return rows;
}

export function invalidateScope(scope: string): void {
  cache.delete(scope);
}

export async function evaluate(
  scope: string,
  ctx: Record<string, unknown>,
): Promise<RuleHit[]> {
  const rows = await loadRules(scope);
  const hits: RuleHit[] = [];
  for (const r of rows) {
    if (matches(r.conditions as unknown, ctx)) {
      hits.push({
        id: r.id,
        key: r.key,
        name: r.name,
        priority: r.priority,
        actions: r.actions as Record<string, unknown>,
      });
    }
  }
  return hits;
}

/**
 * Convenience: returns the merged actions of all matching rules.
 * Later (higher-priority-number) rules override earlier ones; use
 * priority to control the override order.
 */
export async function evaluateActions(
  scope: string,
  ctx: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const hits = await evaluate(scope, ctx);
  const out: Record<string, unknown> = {};
  for (const h of hits) Object.assign(out, h.actions);
  return out;
}

// ---------- matcher engine ----------

function matches(cond: unknown, ctx: Record<string, unknown>): boolean {
  if (cond === null || cond === undefined) return true;
  if (typeof cond !== 'object') return false;
  const c = cond as Record<string, unknown>;
  if (Object.keys(c).length === 0) return true;

  if ('$any' in c) {
    const arr = c.$any;
    if (!Array.isArray(arr)) return false;
    return arr.some((sub) => matches(sub, ctx));
  }
  if ('$all' in c) {
    const arr = c.$all;
    if (!Array.isArray(arr)) return false;
    return arr.every((sub) => matches(sub, ctx));
  }

  // Field-by-field AND.
  for (const [field, expected] of Object.entries(c)) {
    if (field.startsWith('$')) continue;
    const actual = lookup(ctx, field);
    if (!matchOne(actual, expected)) return false;
  }
  return true;
}

function matchOne(actual: unknown, expected: unknown): boolean {
  if (
    expected !== null &&
    typeof expected === 'object' &&
    !Array.isArray(expected)
  ) {
    const ops = expected as Record<string, unknown>;
    for (const [op, val] of Object.entries(ops)) {
      switch (op) {
        case '$eq':
          if (actual !== val) return false;
          break;
        case '$ne':
          if (actual === val) return false;
          break;
        case '$gt':
          if (!(typeof actual === 'number' && typeof val === 'number' && actual > val)) return false;
          break;
        case '$gte':
          if (!(typeof actual === 'number' && typeof val === 'number' && actual >= val)) return false;
          break;
        case '$lt':
          if (!(typeof actual === 'number' && typeof val === 'number' && actual < val)) return false;
          break;
        case '$lte':
          if (!(typeof actual === 'number' && typeof val === 'number' && actual <= val)) return false;
          break;
        case '$in':
          if (!Array.isArray(val) || !val.includes(actual as never)) return false;
          break;
        default:
          // Unknown operator — be strict: don't silently match.
          return false;
      }
    }
    return true;
  }
  // Plain equality (or array → membership).
  if (Array.isArray(expected)) return expected.includes(actual as never);
  return actual === expected;
}

function lookup(ctx: Record<string, unknown>, dotted: string): unknown {
  const parts = dotted.split('.');
  let v: unknown = ctx;
  for (const p of parts) {
    if (v && typeof v === 'object' && p in (v as Record<string, unknown>)) {
      v = (v as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return v;
}

logger.info('business_rules.engine.loaded', { cacheTtlMs: CACHE_MS });
