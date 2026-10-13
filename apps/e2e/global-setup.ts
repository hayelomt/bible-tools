import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { e2eDatabaseUrl } from './env.ts';

// Once per run: drop everything in lamp_e2e_dev and apply every migration from scratch. Playwright
// starts the web servers first; that's fine, as the API only connects on its first query.
export default function setup(): void {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'reset', '--force'], {
    cwd: fileURLToPath(new URL('../api', import.meta.url)),
    env: { ...process.env, DATABASE_URL: e2eDatabaseUrl() },
    stdio: 'pipe',
  });
}
