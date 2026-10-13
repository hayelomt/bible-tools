import base from '@lamp/config/vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
  base,
  defineConfig({
    // The theme tests read the CSS files as text (`?raw`), which Vitest skips unless CSS is on.
    test: { include: ['src/**/*.test.{ts,tsx}'], css: true },
  }),
);
