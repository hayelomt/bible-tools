import { HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };
import { ApiException, ErrorCode } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

async function controllerWith(queryRaw: () => Promise<unknown>): Promise<HealthController> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [HealthService, { provide: PrismaService, useValue: { $queryRaw: queryRaw } }],
  }).compile();
  moduleRef.useLogger(false);
  return moduleRef.get(HealthController);
}

describe('HealthController', () => {
  it('reports the package version once the database answers', async () => {
    const controller = await controllerWith(async () => [{ '?column?': 1 }]);
    await expect(controller.check()).resolves.toEqual({ status: 'ok', version: pkg.version });
  });

  it('returns 503 SERVICE_UNAVAILABLE when the database is unreachable', async () => {
    const controller = await controllerWith(async () => {
      throw new Error('connect ECONNREFUSED');
    });
    const error = await controller.check().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiException);
    expect(error).toMatchObject({
      errorCode: ErrorCode.SERVICE_UNAVAILABLE,
      status: HttpStatus.SERVICE_UNAVAILABLE,
    });
  });
});
