import { highlightSchema } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LampDb } from '../db.ts';
import { ensureDevice } from '../setup.ts';
import {
  createHighlight,
  removeHighlight,
  restoreHighlight,
  updateHighlight,
} from './highlights.ts';

let db: LampDb;
let dbCount = 0;

const ref = {
  book: 'JHN' as const,
  chapter: 10,
  verseStart: 11,
  verseEnd: 12,
  display: 'John 10:11–12',
  translation: 'WEB' as const,
  snapshotText: 'I am the good shepherd. He who is a hired hand…',
};

beforeEach(async () => {
  db = new LampDb(`highlights-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { themePreset: 'parchment', colorMode: 'system', look: 'classic' });
  await db.outbox.clear();
});

afterEach(async () => {
  await db.delete();
});

const citations = () => db.citation.filter((row) => row.sourceType === 'highlight').toArray();

describe('highlights', () => {
  it('are stored with a citation and an outbox change, then edited, removed and restored', async () => {
    const row = await createHighlight(
      { ref, colour: 'yellow', note: null, promotedSectionId: null },
      db,
    );
    expect(row.colour).toBe('yellow');
    expect(row.note).toBeNull();

    const indexed = await citations();
    expect(indexed).toHaveLength(1);
    expect(indexed[0]).toMatchObject({ sourceId: row.id, book: 'JHN', lessonId: null });
    expect(indexed[0]!.startOrd).toBeLessThan(indexed[0]!.endOrd);

    const painted = await updateHighlight(row.id, { colour: 'green' }, db);
    expect(painted.ref).toEqual(ref);
    const noted = await updateHighlight(row.id, { note: 'memorise this' }, db);
    expect(noted).toMatchObject({ colour: 'green', note: 'memorise this' });

    const queued = await db.outbox.toArray();
    expect(queued.map((change) => `${change.entity} ${change.op}`)).toEqual([
      'highlight upsert',
      'highlight upsert',
      'highlight upsert',
    ]);
    // What a push sends: the row without its rev, which the server already accepts.
    for (const change of queued) {
      if (change.op !== 'upsert') continue;
      expect(highlightSchema.omit({ rev: true }).safeParse(change.row).success).toBe(true);
    }

    await removeHighlight(row.id, db);
    expect((await db.highlight.get(row.id))?.deletedAt).not.toBeNull();
    expect(await citations()).toEqual([]);

    await restoreHighlight(row.id, db);
    expect((await db.highlight.get(row.id))?.deletedAt).toBeNull();
    expect(await citations()).toHaveLength(1);
  });
});
