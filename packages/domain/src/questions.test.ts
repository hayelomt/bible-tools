import { describe, expect, it } from 'vitest';
import { latestEntry, lineageOf, partlyAnswered, questionStatus, threadOf } from './questions.ts';
import type { QuestionEntryKind } from './schemas/entities.ts';

const id = (n: number) => `0199e0a0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const ANSWER = id(90);
const entry = (
  n: number,
  kind: QuestionEntryKind,
  day: number,
  { sectionId = null as string | null, deletedAt = null as string | null } = {},
) => ({
  id: id(n),
  kind,
  sectionId,
  deletedAt,
  createdAt: `2026-03-${String(day).padStart(2, '0')}T09:00:00.000Z`,
});
const answered = (sectionId: string) => sectionId === ANSWER;
const unanswered = () => false;

describe('threadOf', () => {
  it('orders entries by when they were made, then by id, without deleted ones', () => {
    const entries = [
      entry(3, 'revisited', 6),
      entry(2, 'asked', 2),
      entry(5, 'partial', 6),
      entry(4, 'reopened', 4, { deletedAt: '2026-03-05T00:00:00.000Z' }),
    ];
    expect(threadOf(entries).map((e) => e.id)).toEqual([id(2), id(3), id(5)]);
    expect(latestEntry(entries)?.id).toBe(id(5));
    expect(latestEntry([])).toBeUndefined();
  });
});

describe('questionStatus', () => {
  it('follows the latest entry', () => {
    const asked = entry(1, 'asked', 2);
    expect(questionStatus([asked], answered)).toBe('open');
    expect(questionStatus([asked, entry(2, 'parked', 3)], answered)).toBe('parked');
    expect(questionStatus([asked, entry(2, 'revisited', 3)], answered)).toBe('open');
    expect(questionStatus([asked, entry(2, 'partial', 3, { sectionId: ANSWER })], answered)).toBe(
      'open',
    );
    const done = entry(3, 'answered', 4, { sectionId: ANSWER });
    expect(questionStatus([asked, done], answered)).toBe('answered');
    expect(questionStatus([asked, done, entry(4, 'reopened', 5)], answered)).toBe('open');
  });

  it('is answered only while the answer section has an answer', () => {
    const entries = [entry(1, 'asked', 2), entry(2, 'answered', 3, { sectionId: ANSWER })];
    expect(questionStatus(entries, unanswered)).toBe('open');
    const gone = [entry(1, 'asked', 2), entry(2, 'answered', 3)];
    expect(questionStatus(gone, answered)).toBe('open');
  });

  it('is the same whichever order entries made on two devices arrive in', () => {
    const a = entry(7, 'parked', 5);
    const b = entry(8, 'answered', 5, { sectionId: ANSWER });
    expect(questionStatus([b, a], answered)).toBe(questionStatus([a, b], answered));
    expect(questionStatus([a, b], answered)).toBe('answered');
  });

  it('is open with no entries, or only deleted ones', () => {
    expect(questionStatus([], answered)).toBe('open');
    const parked = entry(1, 'parked', 2, { deletedAt: '2026-03-03T00:00:00.000Z' });
    expect(questionStatus([parked], answered)).toBe('open');
  });
});

describe('partlyAnswered', () => {
  it('holds from a partial answer until the question is answered or reopened', () => {
    const asked = entry(1, 'asked', 2);
    const partial = entry(2, 'partial', 3, { sectionId: ANSWER });
    expect(partlyAnswered([asked])).toBe(false);
    expect(partlyAnswered([asked, partial])).toBe(true);
    expect(partlyAnswered([asked, partial, entry(3, 'revisited', 4)])).toBe(true);
    expect(partlyAnswered([asked, partial, entry(3, 'answered', 4, { sectionId: ANSWER })])).toBe(
      false,
    );
    expect(partlyAnswered([asked, partial, entry(3, 'reopened', 4)])).toBe(false);
    expect(partlyAnswered([asked, entry(3, 'reopened', 4), entry(4, 'partial', 5)])).toBe(true);
  });

  it('leaves out a deleted partial answer', () => {
    const gone = entry(2, 'partial', 3, { deletedAt: '2026-03-04T00:00:00.000Z' });
    expect(partlyAnswered([entry(1, 'asked', 2), gone])).toBe(false);
  });
});

describe('lineageOf', () => {
  it('counts each time the question came up, and its partial answers, since the first entry', () => {
    const entries = [
      entry(4, 'partial', 9, { sectionId: ANSWER }),
      entry(1, 'asked', 2),
      entry(2, 'revisited', 5),
      entry(3, 'revisited', 7),
      entry(5, 'parked', 10),
      entry(6, 'revisited', 11, { deletedAt: '2026-03-12T00:00:00.000Z' }),
    ];
    expect(lineageOf(entries)).toEqual({
      asked: 3,
      partial: 1,
      since: '2026-03-02T09:00:00.000Z',
    });
    expect(lineageOf([])).toEqual({ asked: 0, partial: 0, since: null });
  });
});
