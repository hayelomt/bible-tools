import { execFileSync } from 'node:child_process';

// Once per run: drop everything in lamp_test_dev and apply every migration from scratch.
export default function setup(): void {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set: run scripts/dev-db.sh to write apps/api/.env.test');
  }
  // The reset is destructive, so make sure this is the test database. Under an AI agent, Prisma
  // also needs PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION (TECH-DESIGN §10.2).
  const database = new URL(url).pathname.slice(1);
  if (!database.endsWith('_test_dev')) {
    throw new Error(
      `Integration tests reset the database, and "${database}" isn't a *_test_dev database`,
    );
  }
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'reset', '--force'], { stdio: 'pipe' });
}
