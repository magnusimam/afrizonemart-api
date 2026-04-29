import { describe, expect, it, vi } from 'vitest';

// Mock prisma so the business-rules service imports without DB.
vi.mock('@/infra/prisma', () => ({
  prisma: {
    businessRule: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

const { evaluate, evaluateActions, invalidateScope } = await import(
  '@/modules/business-rules/service'
);
const { prisma } = (await import('@/infra/prisma')) as unknown as {
  prisma: {
    businessRule: { findMany: ReturnType<typeof vi.fn> };
  };
};

function withRules(
  rules: Array<{
    id: string;
    key: string;
    name: string;
    priority: number;
    isActive: boolean;
    conditions: Record<string, unknown>;
    actions: Record<string, unknown>;
    scope: string;
    createdAt: Date;
  }>,
  scope = 'cart',
) {
  prisma.businessRule.findMany.mockResolvedValue(rules);
  invalidateScope(scope);
}

describe('business-rules engine', () => {
  it('returns empty when no rules match', async () => {
    withRules([]);
    const hits = await evaluate('cart', { subtotal: 100 });
    expect(hits).toHaveLength(0);
  });

  it('matches simple equality', async () => {
    withRules([
      {
        id: 'r1',
        key: 'free_ship',
        name: 'Free shipping for VIPs',
        priority: 100,
        isActive: true,
        scope: 'cart',
        conditions: { 'user.tier': 'VIP' },
        actions: { freeShipping: true },
        createdAt: new Date(),
      },
    ]);
    const hits = await evaluate('cart', { user: { tier: 'VIP' } });
    expect(hits).toHaveLength(1);
    expect(hits[0].actions.freeShipping).toBe(true);
  });

  it('respects $gt / $lt operators', async () => {
    withRules([
      {
        id: 'r1',
        key: 'big',
        name: 'Big',
        priority: 100,
        isActive: true,
        scope: 'cart',
        conditions: { subtotal: { $gte: 15000 } },
        actions: { tier: 'gold' },
        createdAt: new Date(),
      },
    ]);
    expect(await evaluate('cart', { subtotal: 14999 })).toHaveLength(0);
    expect(await evaluate('cart', { subtotal: 15000 })).toHaveLength(1);
    expect(await evaluate('cart', { subtotal: 99_999 })).toHaveLength(1);
  });

  it('$any matches if any sub-condition matches', async () => {
    withRules([
      {
        id: 'r1',
        key: 'or',
        name: 'OR',
        priority: 100,
        isActive: true,
        scope: 'cart',
        conditions: {
          $any: [{ country: 'NG' }, { country: 'KE' }],
        },
        actions: { eligible: true },
        createdAt: new Date(),
      },
    ]);
    expect(await evaluate('cart', { country: 'NG' })).toHaveLength(1);
    expect(await evaluate('cart', { country: 'ZA' })).toHaveLength(0);
  });

  it('evaluateActions merges in priority order', async () => {
    withRules([
      {
        id: 'a',
        key: 'a',
        name: 'a',
        priority: 1,
        isActive: true,
        scope: 'cart',
        conditions: {},
        actions: { tag: 'first', shared: 'a' },
        createdAt: new Date(),
      },
      {
        id: 'b',
        key: 'b',
        name: 'b',
        priority: 100,
        isActive: true,
        scope: 'cart',
        conditions: {},
        actions: { tag: 'second', shared: 'b' },
        createdAt: new Date(),
      },
    ]);
    const merged = await evaluateActions('cart', {});
    // Last (higher priority number) wins on conflict
    expect(merged.shared).toBe('b');
    expect(merged.tag).toBe('second');
  });
});
