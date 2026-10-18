import { readdir, readFile } from 'node:fs/promises';
import { expect, type Page } from '@playwright/test';

// Where the API's MockResend writes in development and tests (TECH-DESIGN §7.3).
const EMAIL_DIR = new URL('../../api/tmp/emails/', import.meta.url);

/** The token of the newest `path` link sent to `address`, waiting for the email to be written. */
export async function linkTo(address: string, path: string): Promise<string> {
  let link = '';
  await expect
    .poll(async () => {
      const files = (await readdir(EMAIL_DIR).catch(() => []))
        .filter((f) => f.endsWith('.eml') && f.includes(`-${address}-`))
        .toSorted()
        .toReversed();
      for (const file of files) {
        const match = new RegExp(`https?://[^\\s"<]+${path}\\?token=[\\w-]{43}`).exec(
          await readFile(new URL(file, EMAIL_DIR), 'utf8'),
        );
        if (match) return (link = match[0]);
      }
      return '';
    })
    .not.toBe('');
  return link;
}

/** Every live row of a device table, read straight from IndexedDB. */
export function rows<T>(page: Page, table: string): Promise<T[]> {
  return page.evaluate(async (name) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('lamp');
      open.addEventListener('success', () => resolve(open.result));
      open.addEventListener('error', () => reject(open.error));
    });
    const all = await new Promise<Record<string, unknown>[]>((resolve, reject) => {
      const request = db.transaction(name).objectStore(name).getAll();
      request.addEventListener('success', () => resolve(request.result));
      request.addEventListener('error', () => reject(request.error));
    });
    db.close();
    // Tombstones are left out; citations have no `deletedAt` at all.
    return all.filter((row) => (row.deletedAt ?? null) === null) as T[];
  }, table) as Promise<T[]>;
}

/** Rows for device tables, by table name. */
export type Seed = Partial<Record<string, Record<string, unknown>[]>>;

/** Writes `seed` into the device database in one transaction, as a pull would. */
export async function writeRows(page: Page, seed: Seed) {
  await page.evaluate(async (tables) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('lamp');
      open.addEventListener('success', () => resolve(open.result));
      open.addEventListener('error', () => reject(open.error));
    });
    const tx = db.transaction(Object.keys(tables), 'readwrite');
    for (const [table, list] of Object.entries(tables)) {
      for (const row of list ?? []) tx.objectStore(table).put(row);
    }
    await new Promise((resolve, reject) => {
      tx.addEventListener('complete', resolve);
      tx.addEventListener('error', () => reject(tx.error));
    });
    db.close();
  }, seed);
}

/** From the lessons home: New lesson, a title, and wait until it's stored. */
export async function newLesson(page: Page, title: string) {
  await page.getByRole('button', { name: 'New lesson' }).click();
  const titleField = page.getByRole('textbox', { name: 'Title', exact: true });
  await expect(titleField).toBeFocused();
  await titleField.fill(title);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
}
