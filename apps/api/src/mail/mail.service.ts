import { Inject, Injectable, Logger } from '@nestjs/common';
// A value import, not `import type`: Nest resolves the constructor parameter from its class.
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { EMAIL_CLIENT, type EmailClient } from './email-client.js';
import type { Email } from './templates.js';

/**
 * Sends the app's emails from noreply@ the host of `APP_URL`, through Resend in production and
 * the mock SDK elsewhere (`createEmailClient`). The same code runs in both.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly from: string;

  constructor(
    @Inject(EMAIL_CLIENT) private readonly client: EmailClient,
    config: ConfigService<Env, true>,
  ) {
    this.from = `Lamp <noreply@${new URL(config.get('APP_URL', { infer: true })).hostname}>`;
  }

  async send(to: string, email: Email): Promise<void> {
    const { data, error } = await this.client.emails.send({ from: this.from, to, ...email });
    if (error) throw new Error(`The email was refused: ${error.name}: ${error.message}`);
    this.logger.log({ id: data.id, subject: email.subject }, 'Email sent');
  }
}
