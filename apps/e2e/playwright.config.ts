import { defineConfig, devices } from '@playwright/test';
import { e2eDatabaseUrl } from './env.ts';

// E2E runs the *built* apps (TECH-DESIGN §10.2): `turbo run e2e` builds them first. The API gets
// its own port so a running `pnpm dev` (on :3000, lamp_dev) is never reused by mistake.
const API_PORT = 3100;
const API_URL = `http://127.0.0.1:${API_PORT}`;
// Matches `preview.port` in apps/web/vite.config.ts.
const WEB_URL = 'http://127.0.0.1:4573';

export default defineConfig({
  testDir: 'tests',
  globalSetup: './global-setup.ts',
  // One shared database: run tests one at a time until they create their own users.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    // `vite preview` serves the built web app and proxies /api to the API below.
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    // Requests go straight to the network, where `page.route` sees them; offline.spec.ts turns
    // the service worker on.
    serviceWorkers: 'block',
    // Past the first-run welcome (look and mode); welcome.spec.ts starts without this.
    storageState: {
      cookies: [],
      origins: [{ origin: WEB_URL, localStorage: [{ name: 'lamp.welcomed', value: 'e2e' }] }],
    },
  },
  // Chromium, and Firefox for the handout's one page (M12-05); Safari/iPhone is checked by hand
  // on a real device.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: 'handout.spec.ts' },
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
        // Links in the emails (written to apps/api/tmp/emails) open the preview server.
        APP_URL: WEB_URL,
      },
      stdout: 'pipe',
    },
    {
      command: 'pnpm exec vite preview --host 127.0.0.1',
      cwd: '../web',
      url: WEB_URL,
      env: { LAMP_API_URL: API_URL },
    },
  ],
});
