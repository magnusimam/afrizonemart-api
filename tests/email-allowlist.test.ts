import { describe, expect, it } from 'vitest';

/**
 * The non-production email allowlist.
 *
 * This is a safety guard, so its failure mode is the expensive direction: a
 * matching bug that lets an address through means a real supplier receives a
 * test email, which cannot be recalled. These lock the matching rules.
 *
 * Mirrors `AllowlistedEmailProvider.permitted` in provider-factory.ts.
 */
function permitted(to: string, allowlist: string): boolean {
  const allow = allowlist.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const addr = to.trim().toLowerCase();
  return allow.some((rule) => (rule.startsWith('*@') ? addr.endsWith(rule.slice(1)) : rule === addr));
}

describe('dev email allowlist', () => {
  it('fails closed when empty — nothing is delivered', () => {
    // The important default. An empty allowlist must not mean "allow all".
    expect(permitted('supplier@realbusiness.ng', '')).toBe(false);
    expect(permitted('anyone@anywhere.com', '   ')).toBe(false);
  });

  it('permits an exact address', () => {
    expect(permitted('me@afrizonemart.com', 'me@afrizonemart.com')).toBe(true);
  });

  it('blocks a real supplier address', () => {
    expect(permitted('adia@adiafoods.ng', 'me@afrizonemart.com')).toBe(false);
  });

  it('handles a comma-separated list with stray spacing', () => {
    const list = ' me@afrizonemart.com , qa@afrizonemart.com ';
    expect(permitted('qa@afrizonemart.com', list)).toBe(true);
    expect(permitted('me@afrizonemart.com', list)).toBe(true);
    expect(permitted('other@afrizonemart.com', list)).toBe(false);
  });

  it('is case-insensitive on both sides', () => {
    expect(permitted('ME@Afrizonemart.COM', 'me@afrizonemart.com')).toBe(true);
    expect(permitted('me@afrizonemart.com', 'ME@AFRIZONEMART.COM')).toBe(true);
  });

  it('supports a domain wildcard', () => {
    expect(permitted('anyone@afrizonemart.com', '*@afrizonemart.com')).toBe(true);
    expect(permitted('adia@adiafoods.ng', '*@afrizonemart.com')).toBe(false);
  });

  it('does not let a lookalike domain slip through the wildcard', () => {
    // The suffix check must include the '@' — otherwise
    // "evil-afrizonemart.com" would match "*@afrizonemart.com".
    expect(permitted('someone@evil-afrizonemart.com', '*@afrizonemart.com')).toBe(false);
    expect(permitted('someone@afrizonemart.com.attacker.io', '*@afrizonemart.com')).toBe(false);
  });

  it('trims whitespace on the recipient', () => {
    expect(permitted('  me@afrizonemart.com  ', 'me@afrizonemart.com')).toBe(true);
  });
});
