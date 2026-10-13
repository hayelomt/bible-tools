import { Controller, Get } from '@nestjs/common';
// A value import, not `import type`: Nest resolves the constructor parameter from its runtime class.
import { type Health, HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  check(): Promise<Health> {
    return this.health.check();
  }
}
