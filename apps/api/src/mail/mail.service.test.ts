import type { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import { type EmailClient, type SendEmailResult, createEmailClient } from './email-client.js';
import { MailService } from './mail.service.js';
import { MockResend } from './mock-resend.js';

const EMAIL = { subject: 'Confirm your email for Lamp', text: 'Open it', html: '<p>Open it</p>' };

function serviceWith(result: SendEmailResult, appUrl = 'https://lamp.example') {
  const send = vi.fn<EmailClient['emails']['send']>().mockResolvedValue(result);
  const config = { get: () => appUrl } as unknown as ConfigService<Env, true>;
  return { send, mail: new MailService({ emails: { send } }, config) };
}

describe('MailService', () => {
  it('sends from noreply@ the app host', async () => {
    const { send, mail } = serviceWith({ data: { id: 'x' }, error: null });
    await mail.send('reader@example.com', EMAIL);
    expect(send).toHaveBeenCalledWith({
      from: 'Lamp <noreply@lamp.example>',
      to: 'reader@example.com',
      ...EMAIL,
    });
  });

  it('throws when the client refuses the email', async () => {
    const { mail } = serviceWith({
      data: null,
      error: { name: 'validation_error', message: 'Invalid `to` field.', statusCode: 422 },
    });
    await expect(mail.send('reader@example.com', EMAIL)).rejects.toThrow(/validation_error/);
  });
});

describe('createEmailClient', () => {
  it('uses Resend in production and the mock everywhere else', () => {
    expect(createEmailClient('production', 're_test')).toBeInstanceOf(Resend);
    expect(createEmailClient('development', undefined)).toBeInstanceOf(MockResend);
    expect(createEmailClient('test', 're_test')).toBeInstanceOf(MockResend);
  });
});
