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
      env: { LOG_LEVEL: 'silent' },
    },
  }),
);
