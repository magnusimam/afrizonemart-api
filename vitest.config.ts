import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Vitest config — TypeScript paths matched to tsconfig.json so `@/*`
 * resolves identically in tests and runtime.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } }, // shared DB → no parallel
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
