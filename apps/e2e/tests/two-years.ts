import {
  citationsFor,
  ENTITY_SCHEMAS,
  type EntityRow,
  keysBetween,
  newId,
  parseReference,
  type SectionBody,
} from '@lamp/domain';
import type { Seed } from './helpers.ts';

// Two years of notes for the M12-11 budget checks (`themes.spec.ts`, `digest.spec.ts`): a sermon
// every Sunday and a study every Wednesday for 104 weeks back from the Sunday on or before today, with
// verse chips, tags, replies, takeaways, questions (half answered) and memory verses, written as a
// sync pull would leave them. Each chip holds its verse's text, as one typed would: without it the
// app fills each stored section in turn as the Bible downloads, rereading the screen each time.

const synced = (at: string) => ({
  id: newId(),
  createdAt: at,
  updatedAt: at,
  rev: 0,
  deletedAt: null,
});

/** Books with at least five chapters of at least six verses: chapter 1–5, verse 1–6 of each. */
const BOOKS = [
  'Gen',
  'Exod',
  'Deut',
  'Ps',
  'Prov',
  'Isa',
  'Jer',
  'Ezek',
  'Dan',
  'Mt',
  'Mk',
  'Lk',
  'Jn',
  'Acts',
  'Rom',
  'Eph',
  'Heb',
  'Jas',
  '1 Jn',
  'Rev',
];

function chip(i: number) {
  const reference = `${BOOKS[i % BOOKS.length]} ${(Math.floor(i / BOOKS.length) % 5) + 1}:${(i % 6) + 1}`;
  const parsed = parseReference(reference);
  if (!parsed.ok) throw new Error(`Not a reference: ${reference}`);
  return { ...parsed.ref };
}

function body(text: string, i: number): SectionBody {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: `${text} ` },
          { type: 'verse', attrs: chip(i) },
          { type: 'text', text: ' and what it asks of us this week.' },
        ],
      },
    ],
  };
}

const WEEKS = 104;
const SECTIONS = 10;
const MEMORY_VERSES = 80;
const day = (base: Date, offset: number) =>
  new Date(base.getTime() + offset * 86_400_000).toISOString().slice(0, 10);

export interface TwoYears {
  seed: Seed;
  lessons: number;
  sections: number;
  tagged: number;
}

/** `tagIds` are the device's seeded tags, by name. */
/** Today on this machine, as the app reads it: "2026-10-19". */
export const localToday = () => new Date().toLocaleDateString('en-CA');

/**
 * `tagIds` are the device's seeded tags, by name. Dated back from `today`, so the last quarter
 * and the last 24 months are full whenever it runs: the budget checks can't fake the clock,
 * which would replace `performance` and its marks.
 */
export function twoYearsOfNotes(tagIds: Map<string, string>, today = localToday()): TwoYears {
  const tags = [...tagIds.values()];
  const seed = {
    series: [] as EntityRow<'series'>[],
    lesson: [] as EntityRow<'lesson'>[],
    section: [] as EntityRow<'section'>[],
    sectionTag: [] as EntityRow<'sectionTag'>[],
    lessonTag: [] as EntityRow<'lessonTag'>[],
    takeaway: [] as EntityRow<'takeaway'>[],
    question: [] as EntityRow<'question'>[],
    questionEntry: [] as EntityRow<'questionEntry'>[],
    memoryItem: [] as EntityRow<'memoryItem'>[],
  };
  const midnight = new Date(`${today}T00:00:00Z`);
  const lastSunday = new Date(midnight.getTime() - midnight.getUTCDay() * 86_400_000);
  const stamp = `${today}T08:00:00.000Z`;
  // A series of 13 sermons a quarter.
  for (let s = 0; s < WEEKS / 13; s++) {
    seed.series.push(
      ENTITY_SCHEMAS.series.parse({
        ...synced(stamp),
        title: `Series ${s + 1}`,
        description: '',
        kind: 'sermon_series',
      }),
    );
  }
  let n = 0;
  for (let week = 0; week < WEEKS; week++) {
    const sunday = day(lastSunday, -7 * (WEEKS - 1 - week));
    for (const [kind, date] of [
      ['sermon', sunday],
      ['personal', day(new Date(`${sunday}T00:00:00Z`), 3)],
    ] as const) {
      if (date > today) continue;
      const at = `${date}T10:00:00.000Z`;
      const lesson = ENTITY_SCHEMAS.lesson.parse({
        ...synced(at),
        seriesId: kind === 'sermon' ? seed.series[Math.floor(week / 13)]!.id : null,
        title: `${kind === 'sermon' ? 'Sermon' : 'Study'}, week ${week + 1}`,
        date,
        kind,
        speaker: null,
        church: null,
        sourceType: null,
        sourceTitle: null,
        sourceAuthor: null,
        sourceUrl: null,
        sourceStartedAt: null,
        groupLessonId: null,
        mainPassages: [chip(n)],
      });
      seed.lesson.push(lesson);
      if (n % 4 === 0) {
        seed.lessonTag.push(
          ENTITY_SCHEMAS.lessonTag.parse({
            ...synced(at),
            tagId: tags[n % tags.length]!,
            lessonId: lesson.id,
          }),
        );
      }
      const keys = keysBetween(null, null, SECTIONS);
      const sections: EntityRow<'section'>[] = [];
      for (let s = 0; s < SECTIONS; s++) {
        const i = n * SECTIONS + s;
        const section = ENTITY_SCHEMAS.section.parse({
          ...synced(at),
          lessonId: lesson.id,
          parentId: null,
          orderKey: keys[s],
          body: body(`Point ${s + 1} of ${lesson.title}: what the passage says`, i),
          conflictOf: null,
          conflictDevice: null,
          sourceAt: null,
          sourcePage: null,
          visibility: 'private',
          groupId: null,
          sharedAt: null,
          replyToId: null,
          answersQuestionId: null,
          answerKind: null,
        });
        sections.push(section);
        // All but the last have a tag, nine of them used most; every third has a second.
        const tagged = s === 9 ? [] : [tags[(i * 7) % 9]!];
        if (s % 3 === 0) tagged.push(tags[(i * 5) % tags.length]!);
        for (const tagId of new Set(tagged)) {
          seed.sectionTag.push(
            ENTITY_SCHEMAS.sectionTag.parse({ ...synced(at), tagId, sectionId: section.id }),
          );
        }
        if (s === 2 || s === 6) {
          sections.push(
            ENTITY_SCHEMAS.section.parse({
              ...synced(at),
              lessonId: lesson.id,
              parentId: section.id,
              orderKey: keysBetween(null, null, 1)[0],
              body: body('A reply on it', i + 1),
              conflictOf: null,
              conflictDevice: null,
              sourceAt: null,
              sourcePage: null,
              visibility: 'private',
              groupId: null,
              sharedAt: null,
              replyToId: null,
              answersQuestionId: null,
              answerKind: null,
            }),
          );
        }
      }
      seed.section.push(...sections);
      seed.takeaway.push(
        ENTITY_SCHEMAS.takeaway.parse({
          ...synced(at),
          lessonId: lesson.id,
          text: `What to keep from ${lesson.title}.`,
        }),
      );
      const question = ENTITY_SCHEMAS.question.parse({
        ...synced(at),
        lessonId: lesson.id,
        text: `What does point ${(n % SECTIONS) + 1} of ${lesson.title} mean?`,
        splitFromId: null,
        visibility: 'private',
        groupId: null,
      });
      seed.question.push(question);
      const entry = (entryKind: 'asked' | 'answered', when: string, sectionId: string | null) =>
        ENTITY_SCHEMAS.questionEntry.parse({
          ...synced(when),
          questionId: question.id,
          lessonId: lesson.id,
          kind: entryKind,
          sectionId,
        });
      seed.questionEntry.push(entry('asked', at, null));
      if (n % 2 === 0 && date < day(midnight, -7)) {
        const answered = `${day(new Date(at), 7)}T10:00:00.000Z`;
        seed.questionEntry.push(entry('answered', answered, sections[0]!.id));
      }
      n++;
    }
  }
  for (let m = 0; m < MEMORY_VERSES; m++) {
    const added = `${day(lastSunday, -9 * m)}T10:00:00.000Z`;
    seed.memoryItem.push(
      ENTITY_SCHEMAS.memoryItem.parse({
        ...synced(added),
        ref: chip(m * 3),
        ease: 2.5,
        interval: (m % 6) * 4,
        nextReviewAt: `${day(lastSunday, (m % 10) - 4)}T10:00:00.000Z`,
        reviewCount: m % 6,
      }),
    );
  }
  const citation = [
    ...seed.lesson.flatMap((row) => citationsFor('lesson', row)),
    ...seed.section.flatMap((row) => citationsFor('section', row)),
    ...seed.memoryItem.flatMap((row) => citationsFor('memoryItem', row)),
  ].map((entry) => ({ id: newId(), ...entry }));
  return {
    seed: { ...seed, citation },
    lessons: seed.lesson.length,
    sections: seed.section.length,
    tagged: seed.sectionTag.length + seed.lessonTag.length,
  };
}
