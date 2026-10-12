import { defineConfig } from 'vitest/config';

// Base Vitest config; packages extend it with mergeConfig in their own vitest.config.ts.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    passWithNoTests: true,
  },
});
