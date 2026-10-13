import { expect, type Page } from '@playwright/test';

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

/** From the lessons home: New lesson, a title, and wait until it's stored. */
export async function newLesson(page: Page, title: string) {
  await page.getByRole('button', { name: 'New lesson' }).click();
  const titleField = page.getByRole('textbox', { name: 'Title' });
  await expect(titleField).toBeFocused();
  await titleField.fill(title);
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
}
