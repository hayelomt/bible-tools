import { z } from 'zod';

/** Every environment variable the API reads. Startup fails with the list of problems if any is invalid. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Written to .env.local / .env.test by scripts/dev-db.sh
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgresql:// URL'),
  // false: no new accounts (a private family deployment); users come from the admin CLI.
  SIGNUP_ENABLED: z.stringbool().default(true),
  // The session cookie's Secure flag. Browsers accept Secure cookies on localhost, so turn it
  // off only to sign in over plain HTTP from another machine (a phone on the LAN).
  COOKIE_SECURE: z.stringbool().default(true),
});

export type Env = z.infer<typeof envSchema>;

/** `.env.test` under Vitest; otherwise `.env.local`, then `.env`. Real environment variables win. */
export function envFilePaths(nodeEnv = process.env.NODE_ENV): string[] {
  return nodeEnv === 'test' ? ['.env.test'] : ['.env.local', '.env'];
}
