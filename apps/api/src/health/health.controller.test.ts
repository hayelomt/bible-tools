import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

describe('HealthController', () => {
  it('gets HealthService injected and reports the package version', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    expect(moduleRef.get(HealthController).check()).toEqual({ status: 'ok', version: pkg.version });
  });
});
