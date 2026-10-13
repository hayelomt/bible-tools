import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type ParsedMail, simpleParser } from 'mailparser';
import { EMAIL_DIR } from '../../src/mail/mock-resend.js';

/**
 * Every email written for this address, oldest first. The folder is shared with development
 * and kept between runs, so tests use addresses of their own (`runEmail`).
 */
export async function emailsTo(address: string): Promise<ParsedMail[]> {
  const marker = `-${address.toLowerCase()}-`;
  const files = (await readdir(EMAIL_DIR).catch(() => []))
    .filter((f) => f.endsWith('.eml') && f.includes(marker))
    .toSorted();
  return Promise.all(files.map(async (f) => simpleParser(await readFile(join(EMAIL_DIR, f)))));
}

export async function lastEmailTo(address: string): Promise<ParsedMail> {
  const mail = (await emailsTo(address)).at(-1);
  if (!mail) throw new Error(`No email to ${address}`);
  return mail;
}

const RUN = Date.now().toString(36);
let next = 1;

/** An address no earlier run has written to. */
export function runEmail(prefix = 'mail'): string {
  return `${prefix}${next++}.${RUN}@example.com`;
}

/** The token of the link to `path` in the email's text, checking the HTML has the same link. */
export function tokenIn(mail: ParsedMail, path: string): string {
  const pattern = new RegExp(`(https?://[^\\s"<]+)${path}\\?token=([\\w-]{43})`);
  const text = pattern.exec(mail.text ?? '');
  if (!text?.[2]) throw new Error(`No ${path} link in "${mail.subject}"`);
  if (!pattern.exec(typeof mail.html === 'string' ? mail.html : '')?.[0].includes(text[2])) {
    throw new Error(`The HTML of "${mail.subject}" has another ${path} link`);
  }
  return text[2];
}
