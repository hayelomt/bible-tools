import type { BookText } from '@lamp/bible-data';
import type { BookCode } from '@lamp/domain';

/**
 * Books for a test, from the verses it quotes: `{ 'JHN 10:9': 'I am the door…' }`. A verse left
 * out is empty. For `vi.mock('@/data/bible.ts')`, as `whenBook` and `bookState` read them.
 */
export function booksOf(verses: Record<string, string>): Map<BookCode, BookText> {
  const books = new Map<BookCode, BookText>();
  for (const [at, text] of Object.entries(verses)) {
    const [, code, chapter, verse] = /^(\w+) (\d+):(\d+)$/u.exec(at)!;
    const book = books.get(code as BookCode) ?? { c: [] };
    const c = (book.c[Number(chapter) - 1] ??= []);
    c[Number(verse) - 1] = text;
    for (let i = 0; i < c.length; i++) c[i] ??= '';
    for (let i = 0; i < book.c.length; i++) book.c[i] ??= [];
    books.set(code as BookCode, book);
  }
  return books;
}
