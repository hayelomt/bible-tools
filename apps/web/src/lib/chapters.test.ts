import { describe, expect, it } from 'vitest';
import { chapterName, chapterSlug, matchBooks, nextChapter, previousChapter } from './chapters.ts';

const names = (filter: string) => matchBooks(filter).map((b) => b.name);

describe('chapters', () => {
  it('steps through a book and on into the next', () => {
    expect(nextChapter({ book: 'JHN', chapter: 10 })).toEqual({ book: 'JHN', chapter: 11 });
    expect(nextChapter({ book: 'MAL', chapter: 4 })).toEqual({ book: 'MAT', chapter: 1 });
    expect(nextChapter({ book: 'OBA', chapter: 1 })).toEqual({ book: 'JON', chapter: 1 });
    expect(nextChapter({ book: 'REV', chapter: 22 })).toBeNull();
  });

  it('steps back into the last chapter of the book before', () => {
    expect(previousChapter({ book: 'JHN', chapter: 10 })).toEqual({ book: 'JHN', chapter: 9 });
    expect(previousChapter({ book: 'MAT', chapter: 1 })).toEqual({ book: 'MAL', chapter: 4 });
    expect(previousChapter({ book: 'JON', chapter: 1 })).toEqual({ book: 'OBA', chapter: 1 });
    expect(previousChapter({ book: 'GEN', chapter: 1 })).toBeNull();
  });

  it('names a chapter and gives its address', () => {
    expect(chapterName({ book: 'PSA', chapter: 23 })).toBe('Psalm 23');
    expect(chapterName({ book: 'JUD', chapter: 1 })).toBe('Jude');
    expect(chapterSlug({ book: '1JN', chapter: 4 })).toBe('1JN.4');
  });

  it('filters books by the start of a name or abbreviation', () => {
    expect(names('')).toHaveLength(66);
    expect(names('1 jo')).toEqual(['1 John']);
    expect(names('First John')).toEqual(['1 John']);
    expect(names('song')).toEqual(['Song of Solomon']);
    expect(names('phil')).toEqual(['Philippians', 'Philemon']);
    expect(names('xyz')).toEqual([]);
  });
});
