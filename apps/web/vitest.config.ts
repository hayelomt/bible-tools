import base from '@lamp/config/vitest';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  mergeConfig(base, viteConfig),
  defineConfig({
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      environment: 'happy-dom',
    },
  }),
);
