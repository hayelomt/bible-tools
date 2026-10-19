import type { SectionBody } from '@lamp/domain';
import { describe, expect, it } from 'vitest';
import { isPlainBody } from './plain.ts';

const doc = (...content: SectionBody['content']): SectionBody => ({ type: 'doc', content });
const verse = {
  type: 'verse' as const,
  attrs: {
    book: 'JHN' as const,
    chapter: 10,
    verseStart: 27,
    display: 'John 10:27',
  },
};

describe('isPlainBody', () => {
  it('takes paragraphs of text and verse chips, empty ones too', () => {
    expect(isPlainBody(doc({ type: 'paragraph' }))).toBe(true);
    expect(
      isPlainBody(doc({ type: 'paragraph', content: [{ type: 'text', text: 'Sheep ' }, verse] })),
    ).toBe(true);
  });

  it('leaves out anything capture mode would lose', () => {
    expect(isPlainBody(doc({ type: 'heading', attrs: { level: 3 }, content: [] }))).toBe(false);
    expect(
      isPlainBody(
        doc({
          type: 'paragraph',
          content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }] }],
        }),
      ),
    ).toBe(false);
    expect(
      isPlainBody(
        doc({
          type: 'bulletList',
          content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
        }),
      ),
    ).toBe(false);
  });
});
