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

  it('applies defaults', () => {
    const DATABASE_URL = 'postgresql://lamp:lamp@127.0.0.1:5432/lamp_dev';
    expect(envSchema.parse({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DATABASE_URL,
      SIGNUP_ENABLED: true,
      COOKIE_SECURE: true,
    });
  });

  it('reads the switches as true/false strings', () => {
    const DATABASE_URL = 'postgresql://lamp:lamp@127.0.0.1:5432/lamp_dev';
    expect(envSchema.parse({ DATABASE_URL, SIGNUP_ENABLED: 'false' }).SIGNUP_ENABLED).toBe(false);
    expect(envSchema.safeParse({ DATABASE_URL, COOKIE_SECURE: 'maybe' }).success).toBe(false);
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
