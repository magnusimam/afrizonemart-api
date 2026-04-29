import { describe, expect, it, vi } from 'vitest';

vi.mock('@/infra/prisma', () => ({
  prisma: {
    customFieldDef: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: '1',
          scope: 'PRODUCT',
          key: 'youtube_url',
          label: 'YouTube',
          description: null,
          type: 'VIDEO',
          required: false,
          sortOrder: 100,
          options: {},
          isActive: true,
        },
        {
          id: '2',
          scope: 'PRODUCT',
          key: 'warranty_months',
          label: 'Warranty (months)',
          description: null,
          type: 'NUMBER',
          required: true,
          sortOrder: 200,
          options: { min: 0, max: 60 },
          isActive: true,
        },
        {
          id: '3',
          scope: 'PRODUCT',
          key: 'size',
          label: 'Size',
          description: null,
          type: 'SELECT',
          required: false,
          sortOrder: 300,
          options: { choices: ['S', 'M', 'L'] },
          isActive: true,
        },
      ]),
    },
  },
}));

const { validateAndNormalizeAttributes } = await import(
  '@/modules/custom-fields/service'
);

describe('custom-fields validation', () => {
  it('coerces VIDEO to URL string', async () => {
    const out = await validateAndNormalizeAttributes('PRODUCT', {
      youtube_url: 'https://www.youtube.com/watch?v=abc',
      warranty_months: 12,
    });
    expect(out.youtube_url).toBe('https://www.youtube.com/watch?v=abc');
  });

  it('rejects malformed URL for VIDEO', async () => {
    await expect(
      validateAndNormalizeAttributes('PRODUCT', {
        youtube_url: 'not-a-url',
        warranty_months: 12,
      }),
    ).rejects.toThrow();
  });

  it('clamps NUMBER to options.min/max', async () => {
    await expect(
      validateAndNormalizeAttributes('PRODUCT', { warranty_months: 99 }),
    ).rejects.toThrow();
  });

  it('rejects unknown SELECT choice', async () => {
    await expect(
      validateAndNormalizeAttributes('PRODUCT', {
        warranty_months: 12,
        size: 'XL',
      }),
    ).rejects.toThrow();
  });

  it('throws on missing required field', async () => {
    await expect(
      validateAndNormalizeAttributes('PRODUCT', { youtube_url: 'https://y.co' }),
    ).rejects.toThrow();
  });

  it('preserves unrecognised legacy keys (bundles/specs)', async () => {
    const out = await validateAndNormalizeAttributes('PRODUCT', {
      warranty_months: 12,
      bundles: [{ label: '6-pack' }],
    });
    expect(out.bundles).toEqual([{ label: '6-pack' }]);
  });
});
