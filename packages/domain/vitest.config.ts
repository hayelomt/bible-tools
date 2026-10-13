import base from '@lamp/config/vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
  base,
  defineConfig({
    test: {
      coverage: {
        provider: 'v8',
        include: ['src/**/*.ts'],
        reporter: ['text'],
        // BACKLOG M1-09: the parser keeps at least 95% branch coverage.
        thresholds: { 'src/parse-reference.ts': { branches: 95 } },
      },
    },
  }),
);
