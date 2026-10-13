import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/auth.decorators.js';
// A value import, not `import type`: Nest resolves the constructor parameter from its runtime class.
import { type Health, HealthService } from './health.service.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  check(): Promise<Health> {
    return this.health.check();
  }
}
