import { describe, expect, it } from 'vitest';
import { atTimeOfDay, clockLabel, offsetLabel, timeOfDay } from './source-time.ts';

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
});
