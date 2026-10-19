import {
  keyBetween,
  type Passage,
  type SectionBody,
  formatPassage,
  type ParsedPassage,
} from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHighlight, removeHighlight } from '@/data/actions/highlights.ts';
import { createLesson, deleteLesson, type LessonFields } from '@/data/actions/lessons.ts';
import { addQuestion } from '@/data/actions/questions.ts';
import { createSection, removeSection, updateSection } from '@/data/actions/sections.ts';
import { addTag } from '@/data/actions/tags.ts';
import { createTakeaway } from '@/data/actions/takeaways.ts';
import { onRowsChanged, type RowRef } from '@/data/changes.ts';
import { LampDb } from '@/data/db.ts';
import { ensureDevice } from '@/data/setup.ts';
import { allDocs, changedDocs } from './read-docs.ts';
import {
  parseQuery,
  type ResultGroup,
  tagNamed,
  tagResults,
  tagSuggestions,
  textResults,
  notedVerses,
  verseIndex,
  verseResults,
} from './results.ts';
import { around, snippet } from './snippet.ts';
import { TextIndex } from './text-index.ts';

let db: LampDb;
let dbCount = 0;
let index: TextIndex;
const ids: Record<string, string> = {};

const verse = (p: Passage) => ({
  type: 'verse' as const,
  attrs: { ...p, display: formatPassage(p) },
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
const lessonFields = (title: string, date: string, mainPassages: Passage[] = []): LessonFields => ({
  seriesId: null,
  title,
  date,
  kind: 'sermon',
  speaker: null,
  church: null,
  sourceType: null,
  sourceTitle: null,
  sourceAuthor: null,
  sourceUrl: null,
  sourceStartedAt: null,
  mainPassages: mainPassages.map((p) => verse(p).attrs),
});
const ROM_8_28: Passage = { book: 'ROM', chapter: 8, verseStart: 28 };
const ROM_7_24_8_2: Passage = {
  book: 'ROM',
  chapter: 7,
  verseStart: 24,
  chapterEnd: 8,
  verseEnd: 2,
};

async function section(name: string, lessonId: string, content: SectionBody, parentId?: string) {
  const row = await createSection(
    {
      lessonId,
      parentId: parentId ?? null,
      orderKey: keyBetween(null, null),
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

/**
 * Two lessons: The Good Shepherd (newer, main passage John 10, tagged #grace) and Justified by
 * Faith (older).
 */
beforeEach(async () => {
  db = new LampDb(`search-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { colorMode: 'system' });
  const shepherd = await createLesson(
    lessonFields('The Good Shepherd', '2026-10-12', [{ book: 'JHN', chapter: 10 }]),
    db,
  );
  const faith = await createLesson(lessonFields('Justified by Faith', '2026-09-07'), db);
  ids.shepherd = shepherd.id;
  ids.faith = faith.id;
  await section('door', shepherd.id, body('I am the door of the sheep.'));
  await section('psalm', shepherd.id, body('The same shepherd as in Psalm 23. ', verse(ROM_8_28)));
  await section('reply', shepherd.id, body('He lays down his life.'), ids.psalm);
  await section('deliver', faith.id, body('Who will deliver me? ', verse(ROM_7_24_8_2)));
  ids.takeaway = (
    await createTakeaway(
      { lessonId: shepherd.id, text: 'The shepherd knows his sheep by name.' },
      db,
    )
  ).id;
  ids.question = (await addQuestion(faith.id, 'Why a shepherd?', db)).id;
  await addTag({ kind: 'lesson', id: shepherd.id }, 'grace', db);
  await addTag({ kind: 'section', id: ids.deliver! }, 'Grace', db);
  await addTag({ kind: 'section', id: ids.door! }, 'growth', db);
  index = new TextIndex();
  index.addAll(await allDocs(db));
});

afterEach(async () => {
  await db.delete();
});

/** Each group as "Lesson title: kind id-name, …", for readable expectations. */
function outline(groups: ResultGroup[]) {
  const names = new Map(Object.entries(ids).map(([name, id]) => [id, name]));
  return groups.map(
    (g) => `${g.lesson.title}: ${g.items.map((i) => `${i.kind} ${names.get(i.id)}`).join(', ')}`,
  );
}

const text = async (query: string) => outline(await textResults(index.search(query), db));

const verses = async (query: string) => {
  const parsed = parseQuery(query);
  if (parsed.kind !== 'verse') throw new Error(`${query} is not a verse query`);
  return verseResults(parsed.passage, db);
};

const show = (value: string, terms: string[], context?: number) =>
  snippet(value, terms, context)
    .map((s) => (s.match ? `**${s.text}**` : s.text))
    .join('');

const marked = (value: string, phrases: string[], context?: number) =>
  around(value, phrases, context)
    .map((s) => (s.match ? `**${s.text}**` : s.text))
    .join('');

describe('parseQuery', () => {
  it('tells tags, verses and free text apart', () => {
    expect(parseQuery('  ')).toEqual({ kind: 'empty' });
    expect(parseQuery('#Grace ')).toEqual({ kind: 'tag', name: 'Grace' });
    expect(parseQuery('#')).toEqual({ kind: 'tag', name: '' });
    const romans = parseQuery('rom 8');
    expect(romans.kind).toBe('verse');
    expect((romans as { passage: ParsedPassage }).passage.display).toBe('Romans 8');
    // A book name alone isn't a passage, so it's searched as a word.
    expect(parseQuery('john')).toEqual({ kind: 'text', text: 'john' });
    expect(parseQuery('shepherd')).toEqual({ kind: 'text', text: 'shepherd' });
  });
});

describe('free text', () => {
  it('finds lesson titles, sections, takeaways and questions, grouped by lesson, newest first', async () => {
    expect(await text('shepherd')).toEqual([
      'The Good Shepherd: lesson shepherd, section psalm, takeaway takeaway',
      'Justified by Faith: question question',
    ]);
  });

  it('matches the word being typed as a prefix, every word, and allows a typo in long words', async () => {
    expect(await text('shep')).toHaveLength(2);
    expect(await text('door sheep')).toEqual(['The Good Shepherd: section door']);
    expect(await text('door goat')).toEqual([]);
    expect(await text('shepherf')).toHaveLength(2);
    // A verse chip is found by its reference, as plain text has it.
    expect(await text('romans')).toEqual([
      'The Good Shepherd: section psalm',
      'Justified by Faith: section deliver',
    ]);
  });

  it('keeps sections in reading order, a reply after its section', async () => {
    expect(await text('the')).toEqual([
      'The Good Shepherd: lesson shepherd, section door, section psalm, takeaway takeaway',
    ]);
    expect(await text('life')).toEqual(['The Good Shepherd: section reply']);
    const [group] = await textResults(index.search('life'), db);
    expect(group?.items[0]).toMatchObject({ kind: 'section', reply: true });
  });

  it('follows each action: an edit, a deleted section, a deleted lesson', async () => {
    const changed: RowRef[] = [];
    const stop = onRowsChanged((refs) => changed.push(...refs));
    const apply = async () => {
      for (const [id, doc] of await changedDocs(changed.splice(0), db)) index.set(id, doc);
    };

    await updateSection(ids.door!, { body: body('I am the gate.') }, db);
    await apply();
    expect(await text('door')).toEqual([]);
    expect(await text('gate')).toEqual(['The Good Shepherd: section door']);

    await removeSection(ids.door!, {}, db);
    await apply();
    expect(await text('gate')).toEqual([]);

    await deleteLesson(ids.shepherd!, db);
    await apply();
    expect(await text('shepherd')).toEqual(['Justified by Faith: question question']);
    stop();
  });
});

describe('verse queries', () => {
  it('match every chip that overlaps the passage, including ranges across chapters', async () => {
    const groups = await verses('Rom 8');
    expect(outline(groups)).toEqual([
      'The Good Shepherd: section psalm',
      'Justified by Faith: section deliver',
    ]);
    expect(groups.map((g) => g.items[0]?.kind === 'section' && g.items[0].passages)).toEqual([
      ['Romans 8:28'],
      ['Romans 7:24–8:2'],
    ]);
    expect(outline(await verses('Romans 8:1'))).toEqual(['Justified by Faith: section deliver']);
    expect(outline(await verses('Rom 9'))).toEqual([]);
  });

  it('match a lesson by its main passages', async () => {
    const groups = await verses('John 10:11');
    expect(outline(groups)).toEqual(['The Good Shepherd: lesson shepherd']);
    expect(groups[0]?.items[0]).toMatchObject({ passages: ['John 10'] });
  });
});

describe('verse index', () => {
  it('lists every citation overlapping Rom 8, newest first, with its lesson and text', async () => {
    const rom8 = parseQuery('Rom 8');
    if (rom8.kind !== 'verse') throw new Error('not a verse query');
    const entries = await verseIndex(rom8.passage, db);
    expect(
      entries.flatMap((entry) =>
        'lesson' in entry ? [[entry.kind, entry.lesson.title, entry.passages, entry.text]] : [],
      ),
    ).toEqual([
      [
        'section',
        'The Good Shepherd',
        ['Romans 8:28'],
        'The same shepherd as in Psalm 23. Romans 8:28',
      ],
      [
        'section',
        'Justified by Faith',
        ['Romans 7:24–8:2'],
        'Who will deliver me? Romans 7:24–8:2',
      ],
    ]);
    const john = parseQuery('John 10');
    if (john.kind !== 'verse') throw new Error('not a verse query');
    expect(
      (await verseIndex(john.passage, db)).map((e) => [e.kind, 'passages' in e && e.passages]),
    ).toEqual([['lesson', ['John 10']]]);
  });

  it('marks the verses where the verse index lists a note, and no others', async () => {
    const markedRom8 = async () => {
      const noted = await notedVerses('ROM', 8, db);
      for (let n = 1; n <= 39; n++) {
        const entries = await verseIndex({ book: 'ROM', chapter: 8, verseStart: n }, db);
        expect(noted.has(n), `Romans 8:${n}`).toBe(
          entries.some((entry) => entry.kind === 'section'),
        );
      }
      return [...noted].toSorted((a, b) => a - b);
    };
    // Romans 7:24–8:2 reaches verses 1 and 2; Romans 8:28 is one verse.
    expect(await markedRom8()).toEqual([1, 2, 28]);
    // A lesson's main passage (John 10) marks nothing.
    expect(await notedVerses('JHN', 10, db)).toEqual(new Set());

    await removeSection(ids.deliver!, {}, db);
    expect(await markedRom8()).toEqual([28]);
  });

  it('follows deleted sections', async () => {
    await removeSection(ids.deliver!, {}, db);
    const rom8 = parseQuery('Rom 8');
    if (rom8.kind !== 'verse') throw new Error('not a verse query');
    expect((await verseIndex(rom8.passage, db)).map((e) => e.id)).toEqual([ids.psalm]);
  });

  it('lists a highlight from the citation index, by the day it was stored', async () => {
    const row = await createHighlight(
      {
        ref: { ...ROM_8_28, display: 'Romans 8:28' },
        colour: 'yellow',
        note: 'memorise this',
        promotedSectionId: null,
      },
      db,
    );
    // Between the two lessons, so the order doesn't depend on today's date.
    await db.highlight.update(row.id, { createdAt: '2026-10-03T12:00:00.000Z' });
    const rom8 = parseQuery('Rom 8');
    if (rom8.kind !== 'verse') throw new Error('not a verse query');
    const entries = await verseIndex(rom8.passage, db);
    expect(entries.map((entry) => entry.kind)).toEqual(['section', 'highlight', 'section']);
    expect(entries[1]).toMatchObject({
      id: row.id,
      colour: 'yellow',
      note: 'memorise this',
      passages: ['Romans 8:28'],
    });

    const john = parseQuery('John 10');
    if (john.kind !== 'verse') throw new Error('not a verse query');
    expect((await verseIndex(john.passage, db)).some((entry) => entry.kind === 'highlight')).toBe(
      false,
    );

    await removeHighlight(row.id, db);
    expect((await verseIndex(rom8.passage, db)).some((entry) => entry.kind === 'highlight')).toBe(
      false,
    );
  });
});

describe('tag queries', () => {
  it('suggest tags that start with what is typed, most used first, with counts', async () => {
    const suggestions = await tagSuggestions('gr', db);
    expect(suggestions.map((s) => [s.tag.name, s.uses])).toEqual([
      ['grace', 2],
      ['growth', 1],
    ]);
    expect((await tagSuggestions('', db)).length).toBeGreaterThan(2);
  });

  it('show what the tag page shows for the tag named', async () => {
    const tag = await tagNamed('GRACE', db);
    expect(tag?.name).toBe('grace');
    expect(outline(await tagResults(tag!.id, db))).toEqual([
      'The Good Shepherd: lesson shepherd',
      'Justified by Faith: section deliver',
    ]);
    expect(await tagNamed('gra', db)).toBeNull();
  });
});

describe('around', () => {
  it('marks each phrase in order, around the first', () => {
    expect(
      marked('Romans 8:28 is like Romans 8:28 and Psalm 23', ['Romans 8:28', 'Psalm 23']),
    ).toBe('**Romans 8:28** is like Romans 8:28 and **Psalm 23**');
    const long = `${'word '.repeat(30)}Romans 8:28 ${'more '.repeat(30)}`;
    expect(marked(long, ['Romans 8:28'], 20)).toMatch(/^…word .*\*\*Romans 8:28\*\* more.*more…$/);
  });
});

describe('snippet', () => {
  it('marks every matching word', () => {
    expect(show('The shepherd knows; the Shepherd calls.', ['shepherd'])).toBe(
      'The **shepherd** knows; the **Shepherd** calls.',
    );
    expect(show('Élie came', ['elie'])).toBe('**Élie** came');
  });

  it('starts near the first match and ends on a word', () => {
    const long = `${'word '.repeat(30)}shepherd ${'more '.repeat(30)}`;
    const shown = show(long, ['shepherd'], 20);
    expect(shown.startsWith('…word')).toBe(true);
    expect(shown).toContain('**shepherd**');
    expect(shown.endsWith('more…')).toBe(true);
    expect(shown.length).toBeLessThan(80);
  });
});
