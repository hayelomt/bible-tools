import type { Tag } from '@lamp/domain';
import { describe, expect, it } from 'vitest';
import { matchTags } from './match-tags.ts';

const tag = (name: string, isSeeded = true): Tag => ({
  id: name,
  name,
  isSeeded,
  createdAt: '2026-10-13T00:00:00.000Z',
  updatedAt: '2026-10-13T00:00:00.000Z',
  rev: 0,
  deletedAt: null,
});

const ALL = [
  'faith',
  'family',
  'grace',
  'growth',
  'Holy Spirit',
  'Spiritual gifts',
  'the cross',
].map((name) => tag(name));
const none = new Set<string>();
const names = (typed: string, applied = none) =>
  matchTags(ALL, typed, applied).tags.map((t) => t.name);

describe('matchTags', () => {
  it('offers names that start with the text, then words, then the rest, ignoring case and #', () => {
    expect(names('gr')).toEqual(['grace', 'growth']);
    expect(names('#SPIRIT')).toEqual(['Spiritual gifts', 'Holy Spirit']);
    expect(names('ros')).toEqual(['the cross']);
    expect(names('fa')).toEqual(['faith', 'family']);
  });

  it('puts the same name first, and offers Create only for a new one', () => {
    const all = [...ALL, tag('graceful', false)];
    expect(matchTags(all, 'Grace', none)).toMatchObject({
      tags: [{ name: 'grace' }, { name: 'graceful' }],
      create: null,
    });
    expect(matchTags(ALL, 'gr', none).create).toBe('gr');
    expect(matchTags(ALL, '  Covenant  love ', none)).toEqual({
      tags: [],
      create: 'Covenant love',
      alreadyOn: null,
    });
  });

  it('offers custom tags like seeded ones', () => {
    const all = [...ALL, tag('Covenant', false)];
    expect(matchTags(all, 'cov', none).tags.map((t) => t.name)).toEqual(['Covenant']);
  });

  it('leaves out tags already on the item, and says so for the same name', () => {
    const applied = new Set(['grace']);
    expect(names('gr', applied)).toEqual(['growth']);
    expect(matchTags(ALL, 'GRACE', applied)).toMatchObject({
      tags: [],
      create: null,
      alreadyOn: { name: 'grace' },
    });
  });

  it('offers every other tag when nothing is typed', () => {
    expect(names('', new Set(['faith']))).toEqual(ALL.slice(1).map((t) => t.name));
    expect(matchTags(ALL, ' # ', none).create).toBeNull();
  });
});
