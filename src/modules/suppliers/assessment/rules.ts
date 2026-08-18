/**
 * Checkpoint applicability rules — deciding which checkpoints belong on a given
 * supplier's checklist.
 *
 * This is the piece that replaces a human reading a PIQ and choosing a form.
 * At a hundred suppliers that judgement call is cheap; at ten thousand it is the
 * bottleneck, and it is also where inconsistency creeps in — two coordinators
 * will not route the same product the same way every time.
 *
 * The predicate language is deliberately tiny. It is data, stored alongside the
 * checkpoint, and it has no loops, no arithmetic and no function calls: a rule
 * can only ever ask questions about a flat fact set. That is a feature. A richer
 * DSL would eventually need its own debugger, and the people who must be able to
 * read these rules are the standards team, not engineers.
 *
 * NOTE ON DUPLICATION: `src/modules/business-rules/service.ts` has a very
 * similar matcher for cart/pricing rules. It is deliberately not reused here —
 * it is DB-backed, scope-cached and lacks the array-membership operator these
 * rules need, and unifying the two would mean editing a module outside the
 * supplier surface. Worth folding together when someone is doing a pass over
 * business-rules anyway; noted here so the next person finds it.
 */

export type Predicate =
  | { all: Predicate[] }
  | { any: Predicate[] }
  | { not: Predicate }
  | { fact: string; op: PredicateOp; value?: unknown };

export type PredicateOp =
  | 'eq'        // scalar equality
  | 'ne'
  | 'in'        // fact ∈ value[]        — "productClass in [flour, cereal]"
  | 'contains'  // value ∈ fact[]        — "substrates contains cassava"
  | 'containsAny' // fact[] ∩ value[] ≠ ∅ — "substrates contains any of [maize, sorghum]"
  | 'isTrue'
  | 'isFalse'
  | 'gt' | 'gte' | 'lt' | 'lte';

/** The flat fact set a rule is evaluated against — the Assessment Profile. */
export type FactSet = Record<string, unknown>;

/**
 * Why a checkpoint ended up on (or off) a checklist.
 *
 * This is not diagnostics — it is printed in the supplier's report. A supplier
 * assessed on cyanide reduction is entitled to know it was because they declared
 * cassava, not because an auditor felt like it. An unexplained score is a score
 * people argue with.
 */
export interface RuleExplanation {
  matched: boolean;
  /** Human-readable, e.g. "substrates contains cassava". */
  reason: string;
}

export function evaluatePredicate(rule: Predicate | undefined, facts: FactSet): RuleExplanation {
  if (!rule) return { matched: true, reason: 'applies to all products' };
  return walk(rule, facts);
}

function walk(rule: Predicate, facts: FactSet): RuleExplanation {
  if ('all' in rule) {
    const parts = rule.all.map((r) => walk(r, facts));
    const failed = parts.find((p) => !p.matched);
    return failed
      ? { matched: false, reason: failed.reason }
      : { matched: true, reason: parts.map((p) => p.reason).join(' and ') };
  }

  if ('any' in rule) {
    const parts = rule.any.map((r) => walk(r, facts));
    const hit = parts.find((p) => p.matched);
    return hit
      ? { matched: true, reason: hit.reason }
      : { matched: false, reason: parts.map((p) => p.reason).join(' or ') };
  }

  if ('not' in rule) {
    const inner = walk(rule.not, facts);
    return { matched: !inner.matched, reason: `not (${inner.reason})` };
  }

  return evaluateLeaf(rule, facts);
}

function evaluateLeaf(rule: Extract<Predicate, { fact: string }>, facts: FactSet): RuleExplanation {
  const actual = lookup(facts, rule.fact);
  const { op, value } = rule;
  const describe = (verb: string) => `${rule.fact} ${verb}`;

  switch (op) {
    case 'eq':
      return { matched: actual === value, reason: describe(`is ${fmt(value)}`) };
    case 'ne':
      return { matched: actual !== value, reason: describe(`is not ${fmt(value)}`) };
    case 'in':
      return {
        matched: Array.isArray(value) && value.includes(actual as never),
        reason: describe(`is one of ${fmt(value)}`),
      };
    case 'contains':
      return {
        matched: Array.isArray(actual) && actual.includes(value as never),
        reason: describe(`contains ${fmt(value)}`),
      };
    case 'containsAny':
      return {
        matched:
          Array.isArray(actual) &&
          Array.isArray(value) &&
          value.some((v) => (actual as unknown[]).includes(v)),
        reason: describe(`contains any of ${fmt(value)}`),
      };
    case 'isTrue':
      return { matched: actual === true, reason: describe('is true') };
    case 'isFalse':
      return { matched: actual === false, reason: describe('is false') };
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const ok =
        typeof actual === 'number' &&
        typeof value === 'number' &&
        ((op === 'gt' && actual > value) ||
          (op === 'gte' && actual >= value) ||
          (op === 'lt' && actual < value) ||
          (op === 'lte' && actual <= value));
      const symbol = { gt: '>', gte: '≥', lt: '<', lte: '≤' }[op];
      return { matched: ok, reason: describe(`${symbol} ${fmt(value)}`) };
    }
    default:
      // An unknown operator must never silently pass. A checkpoint that fails
      // open would quietly drop off checklists — the worst possible failure for
      // a safety assessment, because nothing looks wrong.
      return { matched: false, reason: `unknown operator ${String(op)}` };
  }
}

/** Dotted-path lookup so rules can read nested profile structures. */
function lookup(facts: FactSet, dotted: string): unknown {
  let value: unknown = facts;
  for (const part of dotted.split('.')) {
    if (value && typeof value === 'object' && part in (value as Record<string, unknown>)) {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return value;
}

function fmt(v: unknown): string {
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}
