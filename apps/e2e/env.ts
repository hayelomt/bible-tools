import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const API_ENV_TEST = new URL('../api/.env.test', import.meta.url);

/**
 * The lamp_e2e_dev connection string: `E2E_DATABASE_URL` from the environment (CI), else from
 * apps/api/.env.test (written by scripts/dev-db.sh). Throws unless the database is a *_e2e_dev
 * one, because the global setup resets it. The `_dev` suffix is what lets Prisma's agent
 * checkpoint allow `migrate reset` on a development database.
 */
export function e2eDatabaseUrl(): string {
  const fromFile = existsSync(API_ENV_TEST)
    ? parseEnv(readFileSync(API_ENV_TEST, 'utf8')).E2E_DATABASE_URL
    : undefined;
  const url = process.env.E2E_DATABASE_URL ?? fromFile;
  if (!url) {
    throw new Error(
      'E2E_DATABASE_URL is not set: run scripts/dev-db.sh to write apps/api/.env.test',
    );
  }
  const database = new URL(url).pathname.slice(1);
  if (!database.endsWith('_e2e_dev')) {
    throw new Error(`E2E tests reset the database, and "${database}" isn't a *_e2e_dev database`);
  }
  return url;
}
