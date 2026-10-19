import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
// Value imports, not `import type`: Nest resolves the constructor parameters from their classes.
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { DigestService } from './digest.service.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * The API's own timer for the weekly email (decided 2026-10-19): every hour, and a minute after
 * starting, it sends what's due, so no server needs a cron job. Off in tests, which call
 * `DigestService.sendDue` with the time they want. The timers don't keep the process alive.
 */
@Injectable()
export class DigestScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DigestScheduler.name);
  private readonly timers: NodeJS.Timeout[] = [];
  private running = false;

  constructor(
    private readonly digests: DigestService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    this.timers.push(setTimeout(() => void this.run(), MINUTE).unref());
    this.timers.push(setInterval(() => void this.run(), HOUR).unref());
  }

  onApplicationShutdown(): void {
    for (const timer of this.timers) clearTimeout(timer);
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const sent = await this.digests.sendDue();
      if (sent > 0) this.logger.log({ sent }, 'Weekly group emails sent');
    } catch (error) {
      this.logger.error({ err: error }, 'The weekly group emails failed');
    } finally {
      this.running = false;
    }
  }
}
