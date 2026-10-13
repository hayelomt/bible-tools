import base from '@lamp/config/vitest';
import swc from 'unplugin-swc';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
  base,
  defineConfig({
    // Nest DI reads `design:paramtypes` decorator metadata. Tests compile with SWC, the same
    // compiler `nest build` uses, instead of Vite's Oxc transform (TECH-DESIGN §10.1).
    oxc: false,
    plugins: [swc.vite({ module: { type: 'es6' } })],
    test: {
      // Integration tests have their own config (vitest.int.config.ts).
      exclude: ['**/node_modules/**', '**/*.int.test.ts'],
      env: {
        LOG_LEVEL: 'silent',
        // Unit tests never reach a database (Prisma connects on the first query); the app
        // only needs a valid URL to start.
        DATABASE_URL: 'postgresql://unit-tests@127.0.0.1:1/no_database',
      },
    },
  }),
);
