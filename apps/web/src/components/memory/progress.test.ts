import type { MemoryItem } from '@lamp/domain';
import { describe, expect, it } from 'vitest';
import { dueLabel, inDays, nextDueLine, progressLabel, stageLabel } from './progress.ts';

const item = (fields: Partial<MemoryItem>): MemoryItem => ({
  id: '0192f0c1-0000-7000-8000-000000000001',
  createdAt: '2026-10-03T10:00:00.000Z',
  updatedAt: '2026-10-03T10:00:00.000Z',
  rev: 1,
  deletedAt: null,
  ref: { book: 'JHN', chapter: 10, verseStart: 27, display: 'John 10:27' },
  ease: 2.5,
  interval: 0,
  nextReviewAt: '2026-10-14T00:00:00.000Z',
  reviewCount: 0,
  ...fields,
});
const now = new Date('2026-10-14T12:00:00');
const dueOn = (day: string) => item({ nextReviewAt: `${day}T00:00:00.000Z` });

describe('memory progress', () => {
  it('names how far off a review is, as under the grade buttons', () => {
    expect([0, 1, 2, 6, 12, 59, 68, 400, 800].map(inDays)).toEqual([
      'today',
      'tomorrow',
      '2 days',
      '6 days',
      '12 days',
      '59 days',
      '2 months',
      '13 months',
      '2 years',
    ]);
  });

  it('says when a verse is due', () => {
    expect(
      ['2026-10-10', '2026-10-14', '2026-10-15', '2026-10-17'].map((day) =>
        dueLabel(dueOn(day), '2026-10-14'),
      ),
    ).toEqual(['due today', 'due today', 'due tomorrow', 'due in 3 days']);
  });

  it('shows the stage, the reviews and when it was added', () => {
    expect(stageLabel(item({}))).toBe('new');
    expect(progressLabel(item({}), now)).toBe('New · added Sat 3 Oct');
    const learning = item({ reviewCount: 4, interval: 15 });
    expect(stageLabel(learning)).toBe('learning · 4 reviews');
    expect(progressLabel(learning, now)).toBe('4 reviews · learning since Sat 3 Oct');
    const known = item({ reviewCount: 1, interval: 21 });
    expect(stageLabel(known)).toBe('known · 1 review');
    expect(progressLabel(known, now)).toBe('1 review · known · added Sat 3 Oct');
  });

  it('says when the next verse is due', () => {
    expect(nextDueLine([], '2026-10-14')).toBeNull();
    expect(nextDueLine([dueOn('2026-10-15')], '2026-10-14')).toBe('Next verse due tomorrow.');
    expect(nextDueLine([dueOn('2026-10-20')], '2026-10-14')).toBe('Next verse due in 6 days.');
    expect(nextDueLine([dueOn('2026-10-14')], '2026-10-14')).toBe('More verses are due today.');
  });
});
