import { describe, expect, it } from 'vitest';
import { citationsFor, isCitingEntity } from './citations.ts';
import { emptyBody, type SectionBody } from './doc.ts';
import { newId } from './ids.ts';
import { keyBetween } from './order.ts';
import { idSchema } from './schemas/common.ts';
import type { Highlight, Lesson, MemoryItem, Section } from './schemas/entities.ts';
import { passageRange, type VerseRef } from './verse-ref.ts';

const NOW = '2026-10-13T04:05:06.789Z';
const meta = (id: string) => ({ id, createdAt: NOW, updatedAt: NOW, rev: 0, deletedAt: null });
const ref = (r: Omit<VerseRef, 'display'>): VerseRef => ({ ...r, display: '' });
const ROM_8_28 = ref({ book: 'ROM', chapter: 8, verseStart: 28, verseEnd: 30 });
const JHN_3 = ref({ book: 'JHN', chapter: 3 });

const lesson: Lesson = {
  ...meta(newId()),
  seriesId: null,
  title: 'More than conquerors',
  date: '2026-10-04',
  kind: 'sermon',
  speaker: null,
  church: null,
  sourceType: null,
  sourceTitle: null,
  sourceAuthor: null,
  sourceUrl: null,
  sourceStartedAt: null,
  mainPassages: [ROM_8_28, JHN_3],
};

const chipBody = (...refs: VerseRef[]): SectionBody => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: refs.flatMap((attrs) => [
        { type: 'text' as const, text: 'See ' },
        { type: 'verse' as const, attrs },
      ]),
    },
  ],
});

const section: Section = {
  ...meta(newId()),
  lessonId: lesson.id,
  parentId: null,
  orderKey: keyBetween(),
  body: chipBody(JHN_3, ROM_8_28, JHN_3),
  conflictOf: null,
  conflictDevice: null,
  sourceAt: null,
  sourcePage: null,
};

describe('newId', () => {
  it('makes UUIDv7 ids that sort by creation', () => {
    const ids = Array.from({ length: 100 }, newId);
    for (const id of ids) expect(idSchema.safeParse(id).success).toBe(true);
    expect(ids.toSorted()).toEqual(ids);
  });
});

describe('citationsFor', () => {
  it("indexes a lesson's main passages under the lesson", () => {
    expect(citationsFor('lesson', lesson)).toEqual([
      {
        sourceType: 'lesson',
        sourceId: lesson.id,
        lessonId: lesson.id,
        book: 'ROM',
        startOrd: passageRange(ROM_8_28)[0],
        endOrd: passageRange(ROM_8_28)[1],
      },
      expect.objectContaining({ book: 'JHN', startOrd: passageRange(JHN_3)[0] }),
    ]);
  });

  it("indexes a section's chips once each, under its lesson", () => {
    const citations = citationsFor('section', section);
    expect(citations.map((c) => c.book)).toEqual(['JHN', 'ROM']);
    expect(citations.every((c) => c.sourceType === 'section' && c.lessonId === lesson.id)).toBe(
      true,
    );
  });

  it('indexes highlights and memory items without a lesson', () => {
    const highlight: Highlight = {
      ...meta(newId()),
      ref: JHN_3,
      colour: 'yellow',
      note: null,
      promotedSectionId: null,
    };
    const memoryItem: MemoryItem = {
      ...meta(newId()),
      ref: ROM_8_28,
      ease: 2.5,
      interval: 0,
      nextReviewAt: NOW,
      reviewCount: 0,
    };
    expect(citationsFor('highlight', highlight)).toEqual([
      expect.objectContaining({ sourceType: 'highlight', lessonId: null, book: 'JHN' }),
    ]);
    expect(citationsFor('memoryItem', memoryItem)).toEqual([
      expect.objectContaining({ sourceType: 'memory_item', lessonId: null, book: 'ROM' }),
    ]);
  });

  it('gives nothing for a deleted row or a body without chips', () => {
    expect(citationsFor('lesson', { ...lesson, deletedAt: NOW })).toEqual([]);
    expect(citationsFor('section', { ...section, body: emptyBody() })).toEqual([]);
  });

  it('knows which entities cite verses', () => {
    expect(isCitingEntity('section')).toBe(true);
    expect(isCitingEntity('tag')).toBe(false);
  });
});
