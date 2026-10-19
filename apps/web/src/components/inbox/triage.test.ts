import { describe, expect, it } from 'vitest';
import { addDays } from '@/lib/dates.ts';
import { daysWaiting, oldLabel, snoozeChoices } from './triage.ts';

const at = (day: string) => new Date(`${day}T12:00:00`).toISOString();

describe('snooze choices', () => {
  it('offer tomorrow, the next Sunday and a week on', () => {
    // A Saturday.
    expect(snoozeChoices('2026-10-17')).toEqual([
      { label: 'Tomorrow', until: '2026-10-18' },
      { label: 'Sunday', until: '2026-10-18' },
      { label: 'In a week', until: '2026-10-24' },
    ]);
    // On a Sunday, Sunday is the next one.
    expect(snoozeChoices('2026-10-18')[1]).toEqual({ label: 'Sunday', until: '2026-10-25' });
  });

  it('cross months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('old items', () => {
  it('are flagged after 30 days in the inbox, counted from when they arrived', () => {
    expect(daysWaiting({ createdAt: at('2026-09-08') }, '2026-10-17')).toBe(39);
    expect(oldLabel({ createdAt: at('2026-09-08') }, '2026-10-17')).toBe('39 days old');
    expect(oldLabel({ createdAt: at('2026-09-17') }, '2026-10-17')).toBeNull();
    expect(oldLabel({ createdAt: at('2026-09-16') }, '2026-10-17')).toBe('31 days old');
  });
});
