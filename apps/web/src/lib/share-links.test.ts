import type { ShareLink } from '@lamp/domain';
import { describe, expect, it } from 'vitest';
import { expiresAt, isExpired, linkFor } from './share-links.ts';

const NOW = new Date(2026, 9, 19, 10, 0);

const link = (fields: Partial<ShareLink>): ShareLink => ({
  id: '0199e0a0-0000-7000-8000-000000000001',
  url: 'https://lamp.example/s/x',
  targetType: 'lesson',
  targetId: '0199e0a0-0000-7000-8000-0000000000aa',
  passage: null,
  title: 'The Good Shepherd',
  live: true,
  gone: false,
  expiresAt: null,
  createdAt: NOW.toISOString(),
  lastOpenedAt: null,
  ...fields,
});

describe('linkFor', () => {
  it("finds the target's working link, by id or by passage", () => {
    const lesson = link({});
    const compile = link({
      id: '0199e0a0-0000-7000-8000-000000000002',
      targetType: 'compile',
      targetId: null,
      passage: { book: 'ROM', chapter: 8 },
    });
    const links = [lesson, compile];
    expect(linkFor(links, { targetType: 'lesson', targetId: lesson.targetId! }, NOW)).toBe(lesson);
    expect(
      linkFor(links, { targetType: 'handout', targetId: lesson.targetId! }, NOW),
    ).toBeUndefined();
    expect(
      linkFor(links, { targetType: 'compile', passage: { book: 'ROM', chapter: 8 } }, NOW),
    ).toBe(compile);
    expect(
      linkFor(links, { targetType: 'compile', passage: { book: 'ROM', chapter: 9 } }, NOW),
    ).toBeUndefined();
  });

  it('passes over an expired one, which only Settings shows', () => {
    const expired = link({ expiresAt: new Date(NOW.getTime() - 1).toISOString() });
    expect(isExpired(expired, NOW)).toBe(true);
    expect(linkFor([expired], { targetType: 'lesson', targetId: expired.targetId! }, NOW)).toBe(
      undefined,
    );
  });
});

describe('expiresAt', () => {
  it('is never, a week or 30 days on, or the end of a picked day', () => {
    expect(expiresAt('never', '', NOW)).toBeNull();
    expect(Date.parse(expiresAt('week', '', NOW)!) - NOW.getTime()).toBe(7 * 86_400_000);
    expect(Date.parse(expiresAt('month', '', NOW)!) - NOW.getTime()).toBe(30 * 86_400_000);
    expect(expiresAt('date', '2026-10-25', NOW)).toBe(
      new Date(2026, 9, 25, 23, 59, 59, 999).toISOString(),
    );
  });

  it('refuses a picked day that is today, past or not a day', () => {
    expect(expiresAt('date', '2026-10-19', NOW)).toBeNull();
    expect(expiresAt('date', '2026-10-01', NOW)).toBeNull();
    expect(expiresAt('date', '', NOW)).toBeNull();
  });
});
