import { describe, expect, it } from 'vitest';
import { MAX_TAG_NAME_LENGTH, normaliseTagName, tagKey } from './tag-names.ts';

describe('normaliseTagName', () => {
  it.each([
    ['grace', 'grace'],
    ['#grace', 'grace'],
    ['  ## Holy   Spirit ', 'Holy Spirit'],
    ['the\tcross', 'the cross'],
    ['#', ''],
    ['   ', ''],
  ])('%j becomes %j', (typed, name) => {
    expect(normaliseTagName(typed)).toBe(name);
  });

  it('cuts a long name to the length the schema allows, without a trailing space', () => {
    const name = normaliseTagName(`${'a'.repeat(MAX_TAG_NAME_LENGTH - 1)} b`);
    expect(name).toBe('a'.repeat(MAX_TAG_NAME_LENGTH - 1));
  });
});

describe('tagKey', () => {
  it('is the same for names that differ only in case, spacing or a #', () => {
    expect(tagKey('Grace')).toBe(tagKey('grace'));
    expect(tagKey('#holy  spirit')).toBe(tagKey('Holy Spirit'));
    expect(tagKey('grace')).not.toBe(tagKey('graces'));
  });
});
