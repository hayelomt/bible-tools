import { execFileSync } from 'node:child_process';

// Once per run: drop everything in lamp_test and apply every migration from scratch.
export default function setup(): void {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set: run scripts/dev-db.sh to write apps/api/.env.test');
  }
  // The reset is destructive, so make sure this is a test database.
  const database = new URL(url).pathname.slice(1);
  if (!database.endsWith('_test')) {
    throw new Error(
      `Integration tests reset the database, and "${database}" isn't a *_test database`,
    );
  }
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'reset', '--force'], { stdio: 'pipe' });
}
