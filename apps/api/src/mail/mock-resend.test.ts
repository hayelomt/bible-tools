import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMAIL_DIR, MockResend } from './mock-resend.js';

const EMAIL = { subject: 'Confirm your email for Lamp', text: 'Open it', html: '<p>Open it</p>' };
const FROM = 'Lamp <noreply@localhost>';

async function filesTo(to: string): Promise<string[]> {
  return (await readdir(EMAIL_DIR)).filter((f) => f.includes(`-${to}-`)).toSorted();
}

describe('MockResend', () => {
  it('writes an .eml file named for the recipient, and answers with its id', async () => {
    const to = `mock-${Date.now()}@example.com`;
    const result = await new MockResend().emails.send({ from: FROM, to, ...EMAIL });
    expect(result.error).toBeNull();

    const files = await filesTo(to);
    expect(files).toHaveLength(1);
    const eml = await readFile(join(EMAIL_DIR, files[0]!), 'utf8');
    expect(eml).toContain(`Message-ID: <${result.data?.id}@lamp.local>`);
    expect(eml).toContain(`From: ${FROM}\r\nTo: ${to}\r\nSubject: ${EMAIL.subject}`);
    expect(eml).toContain(
      'Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\nOpen it',
    );
    expect(eml).toContain('Content-Type: text/html; charset=utf-8');
  });

  it('names the files so they sort in the order sent', async () => {
    const to = `order-${Date.now()}@example.com`;
    const client = new MockResend();
    for (const subject of ['first', 'second', 'third']) {
      await client.emails.send({ from: FROM, to, ...EMAIL, subject });
    }
    const subjects = await Promise.all(
      (await filesTo(to)).map(async (f) =>
        /^Subject: (.*)$/m.exec(await readFile(join(EMAIL_DIR, f), 'utf8'))?.[1]?.trim(),
      ),
    );
    expect(subjects).toEqual(['first', 'second', 'third']);
  });

  it('encodes a subject that is not plain ASCII', async () => {
    const to = `utf8-${Date.now()}@example.com`;
    await new MockResend().emails.send({ from: FROM, to, ...EMAIL, subject: 'Grâce' });
    const eml = await readFile(join(EMAIL_DIR, (await filesTo(to))[0]!), 'utf8');
    expect(eml).toContain(`Subject: =?UTF-8?B?${Buffer.from('Grâce').toString('base64')}?=`);
  });

  it.each([
    ['a bad sender', { from: 'Lamp <not an address>' }, 'Invalid `from` field.'],
    ['a bad recipient', { to: 'reader' }, 'Invalid `to` field.'],
    ['no subject', { subject: '' }, 'Missing `subject` field.'],
  ])('answers like Resend for %s, and writes nothing', async (_, change, message) => {
    const to = `bad-${Date.now()}@example.com`;
    const result = await new MockResend().emails.send({ from: FROM, to, ...EMAIL, ...change });
    expect(result).toEqual({
      data: null,
      error: { name: 'validation_error', message, statusCode: 422 },
    });
    expect(await filesTo(to)).toEqual([]);
  });
});
