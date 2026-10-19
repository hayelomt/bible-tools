import type { BookText } from '@lamp/bible-data';
import type { Lesson, Section, SectionBody } from '@lamp/domain';
import { describe, expect, it } from 'vitest';
import { fitStep, type Handout, handoutOf, lastFitStep, leftOutNotice } from './handout.ts';
import type { LessonForExport } from './markdown.ts';

const body = (...lines: string[]): SectionBody => ({
  type: 'doc',
  content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});

let key = 0;
const section = (id: string, parentId: string | null, ...lines: string[]) =>
  ({ id, parentId, orderKey: `a${key++}`, body: body(...lines) }) as unknown as Section;

const LESSON = {
  id: 'l',
  title: 'The Good Shepherd',
  date: '2026-10-11',
  kind: 'sermon',
  speaker: 'Pastor Ann',
  church: null,
  sourceType: 'sermon',
  sourceTitle: 'Sunday service',
  sourceAuthor: null,
  sourceUrl: 'https://www.youtube.com/watch?v=abc',
  sourceStartedAt: null,
  mainPassages: [
    {
      book: 'JHN',
      chapter: 10,
      verseStart: 1,
      verseEnd: 2,
      display: 'John 10:1–2',
    },
    { book: 'PSA', chapter: 23, display: 'Psalm 23', translation: 'pasted' },
  ],
} as unknown as Lesson;

const DATA: LessonForExport = {
  lesson: LESSON,
  sections: [
    section('a', null, 'The door', 'More on it.'),
    section('b', 'a', 'A reply'),
    section('c', null, ''),
    section('d', null, 'The thief'),
  ],
  sectionTags: new Map(),
  tags: ['grace'],
  takeaways: [{ id: 't', text: 'He knows them.' }] as LessonForExport['takeaways'],
  questions: [{ id: 'q', text: 'Who?', status: 'answered' }] as LessonForExport['questions'],
  verses: { translation: 'BSB', text: () => '' },
};

const JOHN = {
  c: [...Array.from({ length: 9 }, () => []), ['Truly, truly…', 'But the one…']],
} as unknown as BookText;

describe('handoutOf', () => {
  it('takes the details, the passages’ text and each top-level section’s first line', () => {
    const handout = handoutOf(DATA, [JOHN, null]);
    expect(handout.details).toEqual([
      'Sunday 11 October 2026 · Sermon · Pastor Ann',
      'Sermon: Sunday service (youtube.com)',
    ]);
    expect(handout.passages).toEqual([
      {
        label: 'John 10:1–2 (BSB)',
        verses: [
          { label: '1', text: 'Truly, truly…' },
          { label: '2', text: 'But the one…' },
        ],
      },
      // Text from outside Lamp has no book here: its reference alone.
      { label: 'Psalm 23 (pasted)', verses: null },
    ]);
    expect(handout.notes).toEqual(['The door', 'The thief']);
    expect(handout.credit).toBe(
      'Scripture: Berean Standard Bible (public domain). Made with Lamp.',
    );
  });

  it('prints a passage without its book as its reference', () => {
    expect(handoutOf(DATA, [null, null]).passages[0]!.verses).toBeNull();
  });

  it('labels the passages in the translation picked in Settings', () => {
    const kjv = { ...DATA, verses: { translation: 'KJV' as const, text: () => '' } };
    const handout = handoutOf(kjv, [JOHN, null]);
    expect(handout.passages.map((p) => p.label)).toEqual([
      'John 10:1–2 (KJV)',
      'Psalm 23 (pasted)',
    ]);
    expect(handout.credit).toBe('Scripture: King James Version (public domain). Made with Lamp.');
  });
});

describe('fitting', () => {
  const handout = {
    notes: ['1', '2', '3'],
    questions: [{ id: 'q', text: '?', status: 'open' }],
    takeaways: ['t'],
  } as Handout;

  it('cuts the text, then makes columns, then smaller type down to 9 pt', () => {
    expect(fitStep(handout, 0)).toMatchObject({ passageText: true, columns: 1, size: 11 });
    expect(fitStep(handout, 1)).toMatchObject({ passageText: false, columns: 1, size: 11 });
    expect(fitStep(handout, 2)).toMatchObject({ passageText: false, columns: 2, size: 11 });
    expect(fitStep(handout, 6)).toMatchObject({ size: 9 });
    expect(leftOutNotice(fitStep(handout, 6))).toBeNull();
  });

  it('then leaves out note headings, then questions, then takeaways, and says so', () => {
    expect(fitStep(handout, 8).leftOut).toEqual({ notes: 2, questions: 0, takeaways: 0 });
    expect(leftOutNotice(fitStep(handout, 7))).toBe(
      'Too long for one page: 1 note heading left out.',
    );
    expect(lastFitStep(handout)).toBe(11);
    expect(leftOutNotice(fitStep(handout, 11))).toBe(
      'Too long for one page: 3 note headings, 1 question and 1 takeaway left out.',
    );
  });
});
