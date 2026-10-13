import { describe, expect, it } from 'vitest';
import { SEED_TAGS } from './seed-tags.ts';

describe('SEED_TAGS', () => {
  it('has 24 distinct themes, ignoring case', () => {
    expect(SEED_TAGS).toHaveLength(24);
    expect(new Set(SEED_TAGS.map((t) => t.toLowerCase())).size).toBe(24);
  });
});
