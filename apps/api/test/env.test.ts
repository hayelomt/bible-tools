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
    expect(envSchema.parse({})).toEqual({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3000,
      LOG_LEVEL: 'info',
    });
  });

  it('stops startup with a message naming every bad variable', async () => {
    vi.stubEnv('PORT', 'abc');
    vi.stubEnv('LOG_LEVEL', 'loud');
    await expect(start()).rejects.toThrow(/Config validation error:[\s\S]*PORT[\s\S]*LOG_LEVEL/);
  });
});
