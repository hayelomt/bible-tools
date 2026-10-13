import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';
import { envFilePaths } from './src/config/env.ts';

// The Prisma CLI doesn't read env files itself. Load the same files as the app (first one
// wins; real environment variables win over all of them).
for (const path of envFilePaths()) {
  if (existsSync(path)) process.loadEnvFile(path);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // Optional so `prisma generate` works without a database (CI, fresh clones).
  datasource: { url: process.env.DATABASE_URL },
});
