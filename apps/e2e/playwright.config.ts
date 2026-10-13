import { defineConfig, devices } from '@playwright/test';
import { e2eDatabaseUrl } from './env.ts';

// E2E runs the *built* apps (TECH-DESIGN §10.2): `turbo run e2e` builds them first. The API gets
// its own port so a running `pnpm dev` (on :3000, lamp_dev) is never reused by mistake.
const API_PORT = 3100;
const API_URL = `http://127.0.0.1:${API_PORT}`;

export default defineConfig({
  testDir: 'tests',
  globalSetup: './global-setup.ts',
  // One shared database: run tests one at a time until they create their own users.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    // Switches to the `vite preview` URL (which proxies /api) once the web app exists (M1-06).
    baseURL: API_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // The iPhone path (Safari is WebKit).
    { name: 'webkit', use: { ...devices['iPhone 15'] } },
  ],
  webServer: [
    {
      command: 'node dist/main.js',
      cwd: '../api',
      url: `${API_URL}/api/health`,
      env: {
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: String(API_PORT),
        DATABASE_URL: e2eDatabaseUrl(),
        LOG_LEVEL: 'warn',
      },
      stdout: 'pipe',
    },
  ],
});
