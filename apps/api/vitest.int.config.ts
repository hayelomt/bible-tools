import { existsSync } from 'node:fs';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Integration tests run against the local lamp_test database (TECH-DESIGN §10.2). Load
// .env.test here so the global setup (main process) and the test workers see DATABASE_URL.
process.env.NODE_ENV = 'test';
if (existsSync('.env.test')) process.loadEnvFile('.env.test');

export default defineConfig({
  oxc: false,
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.int.test.ts'],
    globalSetup: ['test/int/global-setup.ts'],
    // One database, so files run one at a time; each test truncates in beforeEach.
    fileParallelism: false,
    env: { LOG_LEVEL: 'silent' },
  },
});
