import { describe, expect, it } from 'vitest';
import { longDate, shortDate, today } from './dates.ts';

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
});
