import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { EmailClient, SendEmail, SendEmailResult } from './email-client.js';

/** `apps/api/tmp/emails`, from both `src/mail` and `dist/mail`. */
export const EMAIL_DIR = fileURLToPath(new URL('../../tmp/emails/', import.meta.url));

const ADDRESS = /^[^\s@<>]+@[^\s@<>]+$/;
const SENDER = /^(?:[^<>]+<([^\s<>]+)>|([^\s<>]+))$/;

/**
 * Stands in for the Resend SDK outside production: the same `emails.send`, answering the way
 * Resend does (an id, or a `validation_error` for a bad sender or recipient), but writing each
 * message to `tmp/emails` as an `.eml` file instead of sending it. The E2E and integration tests
 * read the links there, and a developer opens the file in any mail app.
 *
 * Files are named `<ms>-<seq>-<recipient>-<id>.eml`, so sorting the names gives the order sent.
 */
export class MockResend implements EmailClient {
  private sent = 0;

  readonly emails = {
    send: (payload: SendEmail): Promise<SendEmailResult> => this.write(payload),
  };

  private async write(payload: SendEmail): Promise<SendEmailResult> {
    const sender = SENDER.exec(payload.from.trim());
    const from = sender?.[1] ?? sender?.[2];
    if (!from || !ADDRESS.test(from)) return invalid('Invalid `from` field.');
    if (!ADDRESS.test(payload.to)) return invalid('Invalid `to` field.');
    if (!payload.subject) return invalid('Missing `subject` field.');

    const id = randomUUID();
    const seq = String(this.sent++).padStart(6, '0');
    await mkdir(EMAIL_DIR, { recursive: true });
    await writeFile(
      `${EMAIL_DIR}${Date.now()}-${seq}-${safeName(payload.to)}-${id.slice(0, 8)}.eml`,
      toEml(id, payload),
    );
    return { data: { id }, error: null };
  }
}

function invalid(message: string): SendEmailResult {
  return { data: null, error: { name: 'validation_error', message, statusCode: 422 } };
}

function safeName(address: string): string {
  return address.toLowerCase().replaceAll(/[^a-z0-9@._-]/g, '_');
}

/** A multipart/alternative message in 8-bit UTF-8, so the links read as they are in the file. */
function toEml(id: string, { from, to, subject, text, html }: SendEmail): string {
  const boundary = `lamp-${id}`;
  const part = (type: string, body: string) =>
    [
      `--${boundary}`,
      `Content-Type: ${type}; charset=utf-8`,
      'Content-Transfer-Encoding: 8bit',
      '',
      body,
    ].join('\r\n');
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${id}@lamp.local>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    part('text/plain', text),
    part('text/html', html),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=`;
}
