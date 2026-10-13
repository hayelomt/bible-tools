import { z } from 'zod';

/** The web app under `pnpm dev`; the links in emails point here outside production. */
const DEV_APP_URL = 'http://localhost:5173';

/**
 * Every environment variable the API reads. Startup fails with the list of problems if any is
 * invalid. Convention over configuration: a variable exists only for a real deployment choice,
 * and everything that follows from `NODE_ENV` is derived instead (see `mail.service.ts` and
 * `sessions.service.ts`).
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    // Written to .env.local / .env.test by scripts/dev-db.sh
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must be a postgresql:// URL'),
    // false: no new accounts (a private family deployment); users come from the admin CLI.
    SIGNUP_ENABLED: z.stringbool().default(true),
    // Where the web app is served: links in emails point here, and emails come from
    // noreply@<its host>. Required in production.
    APP_URL: z
      .url({ protocol: /^https?$/ })
      .transform((url) => url.replace(/\/+$/, ''))
      .optional(),
    // Production sends through Resend; development and tests write .eml files instead.
    RESEND_API_KEY: z.string().startsWith('re_', 'must be a Resend API key (re_…)').optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (!env.APP_URL?.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', path: ['APP_URL'], message: 'an https:// URL in production' });
    }
    if (!env.RESEND_API_KEY) {
      ctx.addIssue({ code: 'custom', path: ['RESEND_API_KEY'], message: 'required in production' });
    }
  })
  .transform((env) => ({ ...env, APP_URL: env.APP_URL ?? DEV_APP_URL }));

export type Env = z.infer<typeof envSchema>;

/** `.env.test` under Vitest; otherwise `.env.local`, then `.env`. Real environment variables win. */
export function envFilePaths(nodeEnv = process.env.NODE_ENV): string[] {
  return nodeEnv === 'test' ? ['.env.test'] : ['.env.local', '.env'];
}
