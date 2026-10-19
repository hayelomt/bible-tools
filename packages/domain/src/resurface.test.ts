import { describe, expect, it } from 'vitest';
import {
  addMonths,
  type CitedRange,
  dismissedOn,
  dismissedUntil,
  openSince,
  repeatedVerses,
  weekStart,
  yearsAgo,
} from './resurface.ts';
import type { QuestionEntry, ResurfaceDismissal } from './schemas/entities.ts';
import { verseOrdinal } from './verse-ref.ts';

describe('addMonths', () => {
  it('keeps the day where the month has it', () => {
    expect(addMonths('2026-10-19', -6)).toBe('2026-04-19');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
  });
});

describe('weekStart', () => {
  it('is the Monday on or before the day', () => {
    expect(weekStart('2026-10-19')).toBe('2026-10-19');
    expect(weekStart('2026-10-25')).toBe('2026-10-19');
    expect(weekStart('2026-10-26')).toBe('2026-10-26');
  });
});

describe('yearsAgo: the same Monday-to-Sunday week in an earlier year', () => {
  // Wednesday 21 October 2026. 21 October 2025 was a Tuesday: the week of 20–26 October 2025.
  const today = '2026-10-21';

  it('takes the week from its Monday to its Sunday', () => {
    expect(yearsAgo('2025-10-19', today)).toBe(0);
    expect(yearsAgo('2025-10-20', today)).toBe(1);
    expect(yearsAgo('2025-10-26', today)).toBe(1);
    expect(yearsAgo('2025-10-27', today)).toBe(0);
  });

  it('counts the years back, each with its own week', () => {
    // 21 October 2024 was a Monday: the week of 21–27 October 2024.
    expect(yearsAgo('2024-10-20', today)).toBe(0);
    expect(yearsAgo('2024-10-21', today)).toBe(2);
    expect(yearsAgo('2024-10-27', today)).toBe(2);
  });

  it('leaves out this year', () => {
    expect(yearsAgo('2026-10-19', today)).toBe(0);
    expect(yearsAgo(today, today)).toBe(0);
  });

  it('follows a week across the new year', () => {
    // Friday 1 January 2027; 1 January 2026 was a Thursday, in the week of 29 Dec – 4 Jan.
    expect(yearsAgo('2025-12-28', '2027-01-01')).toBe(0);
    expect(yearsAgo('2025-12-29', '2027-01-01')).toBe(1);
    expect(yearsAgo('2026-01-04', '2027-01-01')).toBe(1);
    expect(yearsAgo('2026-01-05', '2027-01-01')).toBe(0);
  });

  it('takes 28 February for a 29 February the year lacks', () => {
    // 28 February 2027 is a Sunday, ending the week of 22–28 February.
    expect(yearsAgo('2027-02-21', '2028-02-29')).toBe(0);
    expect(yearsAgo('2027-02-22', '2028-02-29')).toBe(1);
    expect(yearsAgo('2027-02-28', '2028-02-29')).toBe(1);
    expect(yearsAgo('2027-03-01', '2028-02-29')).toBe(0);
  });
});

/** Romans ordinals, and citations of them, for `repeatedVerses`. */
const at = (chapter: number, verse: number) => verseOrdinal('ROM', chapter, verse);
const verse = (lessonId: string, chapter: number, from: number, to = from): CitedRange => ({
  lessonId,
  startOrd: at(chapter, from),
  endOrd: at(chapter, to),
});
const chapter = (lessonId: string, n: number): CitedRange => ({
  lessonId,
  startOrd: at(n, 0),
  endOrd: at(n, 999),
});
const ROM_8_28 = { book: 'ROM', chapter: 8, verseStart: 28 };

describe('repeatedVerses', () => {
  const today = '2026-10-19';

  it('finds a verse cited in three lessons, not in two', () => {
    const two = [verse('a', 8, 28), verse('b', 8, 28)];
    expect(repeatedVerses(two, [], today)).toEqual([]);
    expect(repeatedVerses([...two, verse('c', 8, 28)], [], today)).toEqual([
      { passage: ROM_8_28, lessons: 3, lastVisit: null },
    ]);
  });

  it('counts a lesson once however often it cites the verse', () => {
    const cited = [verse('a', 8, 28), verse('a', 8, 28), verse('b', 8, 28), verse('b', 8, 28)];
    expect(repeatedVerses(cited, [], today)).toEqual([]);
  });

  it('counts a chapter for each of its verses, giving the chapter its most-cited verse', () => {
    const cited = [chapter('a', 8), chapter('b', 8), chapter('c', 8), verse('d', 8, 28)];
    expect(repeatedVerses(cited, [], today)).toEqual([
      { passage: ROM_8_28, lessons: 4, lastVisit: null },
    ]);
  });

  it('is the whole chapter when every verse has the same lessons', () => {
    const cited = [chapter('a', 8), chapter('b', 8), chapter('c', 8)];
    expect(repeatedVerses(cited, [], today)).toEqual([
      { passage: { book: 'ROM', chapter: 8 }, lessons: 3, lastVisit: null },
    ]);
  });

  it('keeps a run of verses with the same lessons together', () => {
    const cited = [verse('a', 8, 28, 30), verse('b', 8, 28, 30), verse('c', 8, 27, 30)];
    expect(repeatedVerses(cited, [], today)).toEqual([
      { passage: { ...ROM_8_28, verseEnd: 30 }, lessons: 3, lastVisit: null },
    ]);
  });

  it('counts a range across two chapters, and leaves out a book or a long run', () => {
    const across = { lessonId: 'c', startOrd: at(7, 24), endOrd: at(8, 2) };
    expect(repeatedVerses([verse('a', 8, 1), verse('b', 8, 1), across], [], today)).toEqual([
      { passage: { book: 'ROM', chapter: 8, verseStart: 1 }, lessons: 3, lastVisit: null },
    ]);
    const book = (lessonId: string) => ({ lessonId, startOrd: at(1, 0), endOrd: at(16, 999) });
    expect(repeatedVerses([book('a'), book('b'), verse('c', 8, 28)], [], today)).toEqual([]);
  });

  it('gives one per chapter, most lessons first, then in canonical order', () => {
    const cited = [
      ...['a', 'b', 'c'].map((l) => verse(l, 12, 1)),
      ...['a', 'b', 'c', 'd'].map((l) => verse(l, 8, 28)),
      ...['a', 'b', 'c'].map((l) => verse(l, 5, 8)),
    ];
    expect(repeatedVerses(cited, [], today).map((v) => v.passage)).toEqual([
      ROM_8_28,
      { book: 'ROM', chapter: 5, verseStart: 8 },
      { book: 'ROM', chapter: 12, verseStart: 1 },
    ]);
  });

  it('leaves out a verse whose compile view was opened in the last six months', () => {
    const cited = ['a', 'b', 'c'].map((l) => verse(l, 8, 28));
    const visit = (day: string, startOrd = at(8, 0), endOrd = at(8, 999)) => ({
      startOrd,
      endOrd,
      day,
    });
    // Six months before 19 October is 19 April: a visit that day still counts.
    expect(repeatedVerses(cited, [visit('2026-04-19')], today)).toEqual([]);
    expect(repeatedVerses(cited, [visit('2026-04-18'), visit('2025-12-01')], today)).toEqual([
      { passage: ROM_8_28, lessons: 3, lastVisit: '2026-04-18' },
    ]);
    // A visit to another verse doesn't.
    expect(repeatedVerses(cited, [visit('2026-10-01', at(8, 29), at(8, 30))], today)).toHaveLength(
      1,
    );
  });
});

const entry = (
  kind: QuestionEntry['kind'],
  createdAt: string,
  deletedAt: string | null = null,
) => ({
  id: createdAt,
  kind,
  createdAt,
  deletedAt,
});

describe('openSince', () => {
  it('is the latest asked or reopened entry; a revisit or a partial answer does not count', () => {
    expect(
      openSince([entry('asked', 't1'), entry('revisited', 't2'), entry('partial', 't3')], 'q'),
    ).toBe('t1');
    expect(
      openSince([entry('asked', 't1'), entry('answered', 't2'), entry('reopened', 't3')], 'q'),
    ).toBe('t3');
    expect(openSince([entry('asked', 't1'), entry('reopened', 't2', 't9')], 'q')).toBe('t1');
  });

  it('falls back to the first entry, then to the question', () => {
    expect(openSince([entry('revisited', 't2')], 'q')).toBe('t2');
    expect(openSince([], 'q')).toBe('q');
  });
});

const dismissal = (until: string, deletedAt: string | null = null) =>
  ({ rule: 'year_ago', targetKey: 'lesson-1', until, deletedAt }) as ResurfaceDismissal;

describe('dismissals', () => {
  it('hide a target until the day before `until`', () => {
    expect(dismissedOn([dismissal('2026-10-20')], '2026-10-19')).toEqual(
      new Set(['year_ago:lesson-1']),
    );
    expect(dismissedOn([dismissal('2026-10-19')], '2026-10-19')).toEqual(new Set());
  });

  it('take the latest until, and ignore a deleted one', () => {
    const both = [dismissal('2026-01-01'), dismissal('2027-10-19')];
    expect(dismissedOn(both, '2026-10-19').size).toBe(1);
    expect(dismissedOn([dismissal('2027-10-19', 'x')], '2026-10-19').size).toBe(0);
  });

  it('last a year', () => {
    expect(dismissedUntil('2026-10-19')).toBe('2027-10-19');
    expect(dismissedUntil('2028-02-29')).toBe('2029-02-28');
  });
});
