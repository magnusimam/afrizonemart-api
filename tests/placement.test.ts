import { describe, expect, it } from 'vitest';
import {
  PLACEMENT_REGISTRY,
  REGISTRY_BY_KEY,
  isCmsKey,
  isStaticKey,
  isValidKey,
} from '@/modules/placements/registry';

describe('placements registry', () => {
  it('every entry has unique key', () => {
    const keys = PLACEMENT_REGISTRY.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('REGISTRY_BY_KEY mirrors the array', () => {
    for (const def of PLACEMENT_REGISTRY) {
      expect(REGISTRY_BY_KEY[def.key]).toBe(def);
    }
  });

  it('isStaticKey is true for known + false for unknown', () => {
    expect(isStaticKey('homepage_hero')).toBe(true);
    expect(isStaticKey('totally_made_up_key')).toBe(false);
  });

  it('isCmsKey identifies the cms: prefix', () => {
    expect(isCmsKey('cms:about-us')).toBe(true);
    expect(isCmsKey('homepage_hero')).toBe(false);
  });

  it('isValidKey checks both static + CMS slugs', () => {
    const cmsSlugs = new Set(['about-us']);
    expect(isValidKey('homepage_hero', cmsSlugs)).toBe(true);
    expect(isValidKey('cms:about-us', cmsSlugs)).toBe(true);
    expect(isValidKey('cms:nonexistent', cmsSlugs)).toBe(false);
    expect(isValidKey('made_up', cmsSlugs)).toBe(false);
  });
});
