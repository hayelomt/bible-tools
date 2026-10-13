import type { HealthResponse } from '@lamp/domain';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ApiException, ErrorCode } from '../common/errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { appVersion } from '../version.js';

/** The shared schema's type; a type-only import, so the build needs nothing from domain. */
export type Health = HealthResponse;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** `ok` once the database answers; 503 otherwise, so the uptime monitor (§11.3) sees an outage. */
  async check(): Promise<Health> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.error(error, 'Health check: database unreachable');
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ErrorCode.SERVICE_UNAVAILABLE,
        'Database unavailable',
      );
    }
    return { status: 'ok', version: appVersion };
  }
}
