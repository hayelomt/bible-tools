import { createGlossary, type PageVerse } from '@lamp/bible-data';
import { KJV_GLOSSARY } from '@lamp/bible-data/kjv-glossary';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DictionaryPanel, verseList } from './dictionary.tsx';

afterEach(cleanup);

const glossary = createGlossary(KJV_GLOSSARY);
const v = (verse: number, text: string, book: PageVerse['book'] = 'JHN'): PageVerse => ({
  book,
  chapter: 3,
  verse,
  text,
});

const terms = (list: HTMLElement) =>
  within(list)
    .getAllByRole('listitem')
    .map((item) => item.querySelector('dfn')?.textContent);

describe('DictionaryPanel', () => {
  it('lists the page’s old words with their verses, then the grammar notes', () => {
    render(
      <DictionaryPanel
        glossary={glossary}
        scope="chapter"
        verses={[v(1, 'They wist not.'), v(2, 'The wind bloweth; thou hearest.'), v(4, 'he wist')]}
      />,
    );
    const words = screen.getByRole('region', { name: 'In this chapter' });
    expect(terms(within(words).getByRole('list'))).toEqual(['wist']);
    expect(words.textContent).toContain('Verses 1, 4');
    const grammar = screen.getByRole('region', { name: 'Grammar' });
    expect(grammar.textContent).toContain('-eth endings');
    expect(grammar.textContent).toContain('thou, thee, ye');
  });

  it('says when the page has no old words', () => {
    render(<DictionaryPanel glossary={glossary} scope="lesson" verses={[v(1, 'Jesus wept.')]} />);
    expect(screen.getByText('No old words in this lesson.')).toBeTruthy();
  });

  it('searches the whole glossary, by word or meaning', () => {
    render(<DictionaryPanel glossary={glossary} scope="chapter" verses={[]} />);
    const search = screen.getByRole('searchbox', { name: 'Search the dictionary' });
    fireEvent.change(search, { target: { value: 'hinder' } });
    expect(terms(screen.getByRole('list', { name: 'Results' }))).toEqual(['let']);
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByText('No words match “zzz”.')).toBeTruthy();
    fireEvent.change(search, { target: { value: '' } });
    expect(screen.queryByRole('list', { name: 'Results' })).toBeNull();
  });

  it('shows only the search box while the glossary loads', () => {
    render(<DictionaryPanel glossary={null} scope="chapter" verses={[v(1, 'wist')]} />);
    expect(screen.getByRole('searchbox')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('verseList', () => {
  it('numbers verses in a chapter and names them in a lesson', () => {
    expect(verseList([v(5, '')], 'chapter')).toBe('Verse 5');
    expect(verseList([v(5, ''), v(7, '')], 'chapter')).toBe('Verses 5, 7');
    expect(verseList([v(5, ''), v(13, '', 'ROM')], 'lesson')).toBe('John 3:5, Romans 3:13');
  });

  it('names six and counts the rest', () => {
    const many = Array.from({ length: 9 }, (_, i) => v(i + 1, ''));
    expect(verseList(many, 'chapter')).toBe('Verses 1, 2, 3, 4, 5, 6 and 3 more');
  });
});
