import { describe, expect, it } from 'vitest';
import { agoLabel, longDate, momentLabel, shortDate, today } from './dates.ts';

const NOW = new Date(2026, 9, 13, 23, 30);

describe('dates', () => {
  it("gives today's date in the device's time zone", () => {
    expect(today(NOW)).toBe('2026-10-13');
    expect(today(new Date(2026, 0, 5, 0, 10))).toBe('2026-01-05');
  });

  it('shows a short date in lists, with the year only when it differs', () => {
    expect(shortDate('2026-10-11', NOW)).toBe('Sun 11 Oct');
    expect(shortDate('2025-12-28', NOW)).toBe('Sun 28 Dec 2025');
  });

  it('shows a long date on the lesson', () => {
    expect(longDate('2026-10-11')).toBe('Sunday 11 October 2026');
  });

  it('names a moment by its day and time on this device', () => {
    expect(momentLabel(new Date(2026, 9, 13, 9, 41).toISOString(), NOW)).toBe('today 09:41');
    expect(momentLabel(new Date(2026, 9, 12, 21, 5).toISOString(), NOW, ' at ')).toBe(
      'yesterday at 21:05',
    );
    expect(momentLabel(new Date(2026, 9, 11, 9, 41).toISOString(), NOW)).toBe('Sun 11 Oct 09:41');
  });

  it('says how long ago, then the moment', () => {
    const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
    expect(agoLabel(ago(0.5), NOW)).toBe('just now');
    expect(agoLabel(ago(2), NOW)).toBe('2 min ago');
    expect(agoLabel(ago(185), NOW)).toBe('3 h ago');
    expect(agoLabel(ago(13 * 60), NOW)).toBe('today 10:30');
  });
});
