import type { SectionBody } from '@lamp/domain';
import { createSection, updateSection } from './actions/sections.ts';
import type { LampDb } from './db.ts';

/**
 * Section text typed in the last half second before the page closed (TECH-DESIGN §8.3). The
 * editor stores typing 500 ms after it stops, and at once when the page is hidden; but a write
 * started as the tab closes is asynchronous, and the browser may drop it. So the hide handler
 * also writes the waiting text here, synchronously, and the next start stores what didn't make it.
 */

const KEY = 'lamp.unsavedSections';

export interface UnsavedSection {
  id: string;
  lessonId: string;
  parentId: string | null;
  orderKey: string;
  body: SectionBody;
  /** The stored row's `updatedAt` the text was typed on; null for a draft. */
  base: string | null;
}

type Journal = Record<string, UnsavedSection>;

function read(storage: Storage): Journal {
  try {
    return JSON.parse(storage.getItem(KEY) ?? '{}') as Journal;
  } catch {
    return {};
  }
}

function write(storage: Storage, journal: Journal) {
  try {
    if (Object.keys(journal).length === 0) storage.removeItem(KEY);
    else storage.setItem(KEY, JSON.stringify(journal));
  } catch {
    // Storage full or blocked: the IndexedDB write is still on its way.
  }
}

/** Keeps a section's waiting text until it's stored. Synchronous, for `pagehide`. */
export function keepUnsaved(entry: UnsavedSection, storage: Storage = localStorage): void {
  write(storage, { ...read(storage), [entry.id]: entry });
}

/** Forgets a section's kept text once that text is stored (newer kept text stays). */
export function forgetUnsaved(id: string, body: SectionBody, storage: Storage = localStorage) {
  const journal = read(storage);
  const kept = journal[id];
  if (!kept || JSON.stringify(kept.body) !== JSON.stringify(body)) return;
  delete journal[id];
  write(storage, journal);
}

/**
 * Stores kept text on start, through the same actions as typing. Text is only applied to the row
 * it was typed on: if the row changed since (the write did land, or a newer change came), or its
 * lesson is gone, the kept text is dropped.
 */
export async function restoreUnsaved(db: LampDb, storage: Storage = localStorage): Promise<void> {
  const journal = read(storage);
  for (const entry of Object.values(journal)) {
    try {
      const row = await db.section.get(entry.id);
      if (row) {
        if (row.deletedAt === null && row.updatedAt === entry.base) {
          await updateSection(entry.id, { body: entry.body }, db);
        }
      } else if (entry.base === null) {
        const lesson = await db.lesson.get(entry.lessonId);
        if (lesson && lesson.deletedAt === null) {
          const { base: _, ...fields } = entry;
          await createSection({ ...fields, conflictOf: null, conflictDevice: null }, db);
        }
      }
    } catch (error) {
      console.error('Restoring unsaved text failed', error);
    }
    forgetUnsaved(entry.id, entry.body, storage);
  }
}
