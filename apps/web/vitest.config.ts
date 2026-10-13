import base from '@lamp/config/vitest';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  mergeConfig(base, viteConfig),
  defineConfig({
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      // Run by the API's test:int, against a real API (the sync contract test, M3-14).
      exclude: ['src/**/*.int.test.ts'],
      environment: 'happy-dom',
    },
  }),
);
