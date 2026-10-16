import type { BookText } from '@lamp/bible-data';
import { keyBetween, type SectionBody, type VerseRef } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLesson } from './actions/lessons.ts';
import { createSection } from './actions/sections.ts';
import { LampDb } from './db.ts';
import { ensureDevice } from './setup.ts';
import { booksWaiting, fillStoredSnapshots, withSnapshots } from './snapshots.ts';

// Jude 1 in miniature.
const JUDE: BookText = { c: [['Jude, a servant of Jesus Christ.', 'Mercy to you.']] };

const chip = (ref: Partial<VerseRef>) => ({
  type: 'verse' as const,
  attrs: { translation: 'BSB' as const, ...ref } as VerseRef,
});
const jude2 = chip({ book: 'JUD', chapter: 1, verseStart: 2, display: 'Jude 2' });
const john = chip({
  book: 'JHN',
  chapter: 3,
  verseStart: 16,
  display: 'John 3:16',
  snapshotText: 'For God so loved the world.',
});

/** A paragraph and a quote holding chips. */
const body = (...chips: ReturnType<typeof chip>[]): SectionBody => ({
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'See ' }, chips[0]!] },
    { type: 'blockquote', content: [{ type: 'paragraph', content: chips.slice(1) }] },
  ],
});

describe('withSnapshots', () => {
  it('fills the chips waiting for a book that is here, at any depth', () => {
    const waiting = body(jude2, john, jude2);
    expect(booksWaiting(waiting)).toEqual(new Set(['BSB:JUD']));
    const filled = withSnapshots(waiting, new Map([['BSB:JUD', JUDE]]))!;
    expect(booksWaiting(filled)).toEqual(new Set());
    expect(JSON.stringify(filled).match(/Mercy to you\./g)).toHaveLength(2);
    // A chip with its text keeps it, and the body given is left as it was.
    expect(JSON.stringify(filled)).toContain('For God so loved the world.');
    expect(booksWaiting(waiting)).toEqual(new Set(['BSB:JUD']));
  });

  it('fills a chip from the book of its own translation', () => {
    const kjv = chip({
      book: 'JUD',
      chapter: 1,
      verseStart: 2,
      display: 'Jude 2',
      translation: 'KJV',
    });
    const waiting = body(kjv, jude2);
    expect(booksWaiting(waiting)).toEqual(new Set(['KJV:JUD', 'BSB:JUD']));
    const kjvJude: BookText = { c: [['Jude, the servant of Jesus Christ.', 'Mercy unto you.']] };
    const filled = withSnapshots(waiting, new Map([['KJV:JUD', kjvJude]]))!;
    expect(booksWaiting(filled)).toEqual(new Set(['BSB:JUD']));
    expect(JSON.stringify(filled)).toContain('Mercy unto you.');
    expect(JSON.stringify(filled)).not.toContain('Mercy to you.');
  });

  it('gives null when no waiting chip has its book', () => {
    expect(withSnapshots(body(jude2, john), new Map())).toBeNull();
    expect(withSnapshots(body(john), new Map([['BSB:JUD', JUDE]]))).toBeNull();
  });
});

describe('fillStoredSnapshots', () => {
  let db: LampDb;

  beforeEach(async () => {
    db = new LampDb('snapshots', { indexedDB, IDBKeyRange });
    await ensureDevice(db, { colorMode: 'system' });
    const files: Record<string, unknown> = {
      '/bible/manifest.json': {
        translations: { BSB: { books: { JUD: { file: 'BSB/JUD.1.json' } } } },
      },
      '/bible/BSB/JUD.1.json': JUDE,
    };
    vi.stubGlobal('fetch', (url: string) => Promise.resolve(Response.json(files[url])));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await db.delete();
  });

  it('gives stored chips their text once, as a change to sync', async () => {
    const { id: lessonId } = await createLesson(
      {
        seriesId: null,
        title: 'Contend for the faith',
        date: '2026-10-13',
        source: 'sermon',
        speaker: null,
        church: null,
        mainPassages: [],
      },
      db,
    );
    const { id } = await createSection(
      {
        lessonId,
        parentId: null,
        orderKey: keyBetween(null, null),
        body: body(jude2, john),
        conflictOf: null,
        conflictDevice: null,
      },
      db,
    );
    await db.outbox.clear();

    await fillStoredSnapshots(db);
    const row = await db.section.get(id);
    expect(JSON.stringify(row!.body)).toContain('Mercy to you.');
    expect(await db.outbox.toArray()).toEqual([
      expect.objectContaining({ entity: 'section', entityId: id, op: 'upsert' }),
    ]);

    // Nothing is waiting any more: nothing changes.
    await fillStoredSnapshots(db);
    expect(await db.outbox.count()).toBe(1);
  });
});
