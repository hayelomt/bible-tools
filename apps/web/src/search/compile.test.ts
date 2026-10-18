import {
  compileScopes,
  formatPassage,
  keyBetween,
  type Passage,
  type SectionBody,
} from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLesson, deleteLesson } from '@/data/actions/lessons.ts';
import { createSection, removeSection } from '@/data/actions/sections.ts';
import { LampDb } from '@/data/db.ts';
import { ensureDevice } from '@/data/setup.ts';
import { type Commentary, commentary } from './compile.ts';

let db: LampDb;
let dbCount = 0;
const ids: Record<string, string> = {};

const rom = (chapter: number, verseStart?: number): Passage => ({
  book: 'ROM',
  chapter,
  ...(verseStart !== undefined ? { verseStart } : {}),
});
const verse = (p: Passage) => ({
  type: 'verse' as const,
  attrs: { ...p, display: formatPassage(p), translation: 'BSB' as const },
});
const body = (...content: Array<string | ReturnType<typeof verse>>): SectionBody => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: content.map((c) => (typeof c === 'string' ? { type: 'text', text: c } : c)),
    },
  ],
});

async function lesson(name: string, date: string) {
  const row = await createLesson(
    {
      seriesId: null,
      title: name,
      date,
      kind: 'sermon',
      speaker: null,
      church: null,
      sourceType: null,
      sourceTitle: null,
      sourceAuthor: null,
      sourceUrl: null,
      sourceStartedAt: null,
      mainPassages: [verse(rom(8)).attrs],
    },
    db,
  );
  ids[name] = row.id;
}

let last: string | null = null;
async function section(name: string, lessonName: string, content: SectionBody, parent?: string) {
  last = keyBetween(last, null);
  const row = await createSection(
    {
      lessonId: ids[lessonName]!,
      parentId: parent ? ids[parent]! : null,
      orderKey: last,
      body: content,
      conflictOf: null,
      conflictDevice: null,
      sourceAt: null,
      sourcePage: null,
    },
    db,
  );
  ids[name] = row.id;
}

/** Each group as its passage, then its sections by name. */
function shape({ groups }: Commentary) {
  const names = new Map(Object.entries(ids).map(([name, id]) => [id, name]));
  return groups.map((g) => [
    formatPassage(g.passage),
    g.entries.map(
      (e) =>
        `${names.get(e.item.section.id)}${e.item.nested ? ' (nested)' : ''}${e.shownUnder ? ` → ${formatPassage(e.shownUnder)}` : ''}`,
    ),
  ]);
}

beforeEach(async () => {
  db = new LampDb(`compile-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { colorMode: 'system' });
  await lesson('shepherd', '2026-10-12');
  await lesson('faith', '2025-09-07');
  await section('promise', 'shepherd', body('All things work together. ', verse(rom(8, 28))));
  await section('plain', 'shepherd', body('No chip here.'));
  await section('answer', 'shepherd', body('Even this. ', verse(rom(8, 28))), 'promise');
  await section('aside', 'shepherd', body('A reply without a chip.'), 'promise');
  await section('verdict', 'faith', body('No condemnation. ', verse(rom(8, 1))));
  await section('both', 'faith', body('Called. ', verse(rom(8, 28)), verse(rom(9, 1))));
  await section('genesis', 'faith', body('In the beginning. ', verse({ book: 'GEN', chapter: 1 })));
});

afterEach(async () => {
  await db.delete();
});

describe('commentary', () => {
  it('groups the sections citing a chapter by verse, then date, with replies nested', async () => {
    const result = await commentary(rom(8), db);
    expect(shape(result)).toEqual([
      ['Romans 8:1', ['verdict']],
      ['Romans 8:28', ['both', 'promise', 'answer (nested)']],
    ]);
    expect(result.sections).toBe(4);
    expect(result.lessons).toBe(2);
  });

  it('shows a section citing two chapters once, with a pointer under the other', async () => {
    const result = await commentary(compileScopes(rom(8)).book, db);
    expect(shape(result)).toEqual([
      ['Romans 8:1', ['verdict']],
      ['Romans 8:28', ['both', 'promise', 'answer (nested)']],
      ['Romans 9:1', ['both → Romans 8:28']],
    ]);
    expect(result.sections).toBe(4);
  });

  it('shows a reply on its own when its section doesn’t cite the passage', async () => {
    await section('lone', 'shepherd', body('Cites it alone. ', verse(rom(8, 1))), 'promise');
    expect(shape(await commentary(rom(8, 1), db))).toEqual([['Romans 8:1', ['verdict', 'lone']]]);
  });

  it('leaves out deleted sections and the sections of deleted lessons', async () => {
    await removeSection(ids.verdict!, {}, db);
    await deleteLesson(ids.shepherd!, db);
    const result = await commentary(rom(8), db);
    expect(shape(result)).toEqual([['Romans 8:28', ['both']]]);
    expect(result.lessons).toBe(1);
  });

  it('is empty when nothing cites the passage', async () => {
    expect(await commentary(rom(3), db)).toEqual({
      groups: [],
      sections: 0,
      lessons: 0,
      complete: true,
    });
  });

  it('reads the first groups alone for the first screen, counting them all', async () => {
    const result = await commentary(compileScopes(rom(8)).book, db, 1);
    expect(shape(result)).toEqual([['Romans 8:1', ['verdict']]]);
    expect(result).toMatchObject({ sections: 4, lessons: 2, complete: false });
  });
});
