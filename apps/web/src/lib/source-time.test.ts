import { describe, expect, it } from 'vitest';
import {
  atTimeOfDay,
  clockLabel,
  midnightOf,
  offsetLabel,
  offsetSeconds,
  parseMoment,
  timeOfDay,
} from './source-time.ts';

describe('source times', () => {
  it('show minutes and seconds, hours once there are any, and a minus before the start', () => {
    expect(clockLabel(0)).toBe('00:00');
    expect(clockLabel((9 * 60 + 45) * 1000 + 999)).toBe('09:45');
    expect(clockLabel((62 * 60 + 10) * 1000)).toBe('1:02:10');
    expect(clockLabel(-30_000)).toBe('−00:30');
  });

  it('count from the start, so moving the start moves every time', () => {
    const at = '2026-10-18T10:53:14.000Z';
    expect(offsetLabel(at, '2026-10-18T10:30:00.000Z')).toBe('23:14');
    expect(offsetLabel(at, '2026-10-18T10:45:00.000Z')).toBe('08:14');
  });

  it('set a start at a time of day on the same day', () => {
    const start = new Date(2026, 9, 18, 9, 58, 12).toISOString();
    const moved = atTimeOfDay(start, '10:30');
    expect(moved).toBe(new Date(2026, 9, 18, 10, 30, 0).toISOString());
    expect(timeOfDay(moved!)).toBe('10:30');
    expect(atTimeOfDay(start, '25:00')).toBeNull();
    expect(atTimeOfDay(start, 'soon')).toBeNull();
  });

  it('read a typed time into the recording, or a page', () => {
    expect(parseMoment('9:45')).toEqual({ kind: 'time', ms: 585_000 });
    expect(parseMoment(' 09:45 ')).toEqual({ kind: 'time', ms: 585_000 });
    expect(parseMoment('1:02:10')).toEqual({ kind: 'time', ms: 3_730_000 });
    expect(parseMoment('75:00')).toEqual({ kind: 'time', ms: 4_500_000 });
    expect(parseMoment('p. 112')).toEqual({ kind: 'page', page: '112' });
    expect(parseMoment('page 7')).toEqual({ kind: 'page', page: '7' });
    expect(parseMoment('pp. 112-14')).toEqual({ kind: 'page', page: '112–14' });
    expect(parseMoment('xii')).toBeNull();
    expect(parseMoment('9:75')).toBeNull();
    expect(parseMoment('1:75:00')).toBeNull();
    expect(parseMoment('')).toBeNull();
  });

  it('give whole seconds into the source for a link, and anchor a lesson without a start', () => {
    expect(offsetSeconds('2026-10-18T10:39:45.900Z', '2026-10-18T10:30:00.000Z')).toBe(585);
    expect(offsetSeconds('2026-10-18T10:29:00.000Z', '2026-10-18T10:30:00.000Z')).toBe(0);
    const midnight = midnightOf('2026-10-12');
    expect(timeOfDay(midnight, true)).toBe('00:00:00');
    expect(new Date(midnight).getDate()).toBe(12);
  });
});
