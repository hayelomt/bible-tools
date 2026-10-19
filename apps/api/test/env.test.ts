import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { envSchema } from '../src/config/env.js';

// AppModule validates the environment when it is imported, so each call imports it fresh.
async function start(): Promise<void> {
  const { AppModule } = await import('../src/app.module.js');
  await Test.createTestingModule({ imports: [AppModule] }).compile();
}

describe('env validation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const DATABASE_URL = 'postgresql://lamp:lamp@127.0.0.1:5432/lamp_dev';

  it('applies defaults', () => {
    expect(envSchema.parse({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL,
      SIGNUP_ENABLED: true,
      APP_URL: 'http://localhost:5173',
      SHARE_LINK_SECRET: 'lamp-development-share-link-secret-not-for-production',
    });
  });

  it('drops a trailing slash from APP_URL, and refuses other schemes', () => {
    expect(envSchema.parse({ DATABASE_URL, APP_URL: 'https://lamp.example/' }).APP_URL).toBe(
      'https://lamp.example',
    );
    expect(envSchema.safeParse({ DATABASE_URL, APP_URL: 'ftp://lamp.example' }).success).toBe(
      false,
    );
  });

  it('in production, needs an https APP_URL, a Resend key and a share link secret', () => {
    const production = { DATABASE_URL, NODE_ENV: 'production' };
    const issues = envSchema.safeParse(production).error?.issues.map((i) => i.path.join('.'));
    expect(issues).toEqual(['APP_URL', 'RESEND_API_KEY', 'SHARE_LINK_SECRET']);
    const ready = {
      ...production,
      APP_URL: 'https://lamp.example',
      RESEND_API_KEY: 're_123',
      SHARE_LINK_SECRET: 'k'.repeat(32),
    };
    expect(envSchema.safeParse(ready).success).toBe(true);
    expect(envSchema.safeParse({ ...ready, APP_URL: 'http://lamp.example' }).success).toBe(false);
    expect(envSchema.safeParse({ ...ready, RESEND_API_KEY: 'sk_123' }).success).toBe(false);
    expect(envSchema.safeParse({ ...ready, SHARE_LINK_SECRET: 'short' }).success).toBe(false);
  });

  it('reads SIGNUP_ENABLED as a true/false string', () => {
    expect(envSchema.parse({ DATABASE_URL, SIGNUP_ENABLED: 'false' }).SIGNUP_ENABLED).toBe(false);
    expect(envSchema.safeParse({ DATABASE_URL, SIGNUP_ENABLED: 'maybe' }).success).toBe(false);
  });

  it('requires a postgresql:// DATABASE_URL', () => {
    expect(envSchema.safeParse({}).success).toBe(false);
    expect(envSchema.safeParse({ DATABASE_URL: 'mysql://x' }).success).toBe(false);
  });

  it('stops startup with a message naming every bad variable', async () => {
    vi.stubEnv('PORT', 'abc');
    vi.stubEnv('LOG_LEVEL', 'loud');
    await expect(start()).rejects.toThrow(/Config validation error:[\s\S]*PORT[\s\S]*LOG_LEVEL/);
  });
});
