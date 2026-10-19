import { Resend } from 'resend';
import { MockResend } from './mock-resend.js';

/** The part of the Resend SDK the app uses. `Resend` and `MockResend` both provide it. */
export interface EmailClient {
  emails: {
    send(payload: SendEmail): Promise<SendEmailResult>;
  };
}

export interface SendEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

/** Resend's response shape: errors are returned, not thrown. */
export type SendEmailResult =
  | { data: { id: string }; error: null }
  | { data: null; error: { name: string; message: string; statusCode: number | null } };

/** Nest injection token for the client. */
export const EMAIL_CLIENT = Symbol('EMAIL_CLIENT');

/** The real Resend in production; the mock, writing `.eml` files, in development and tests. */
export function createEmailClient(nodeEnv: string, apiKey: string | undefined): EmailClient {
  return nodeEnv === 'production' ? new Resend(apiKey) : new MockResend();
}
