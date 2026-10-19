import { describe, expect, it } from 'vitest';
import { chipsWithoutAppText, withoutAppText } from './app-text.ts';

const chip = (attrs: object) => ({ type: 'verse', attrs });
const PASSAGE = { book: 'ROM', chapter: 8, verseStart: 28, display: 'Romans 8:28' };

describe('withoutAppText', () => {
  it("takes the app's translation and snapshot out of a reference stored before decision 97", () => {
    expect(
      withoutAppText({ ...PASSAGE, translation: 'BSB', snapshotText: 'And we know…' }),
    ).toEqual(PASSAGE);
    expect(withoutAppText({ ...PASSAGE, translation: 'KJV' })).toEqual(PASSAGE);
  });

  it('keeps text from outside, and a reference already without', () => {
    const niv = { ...PASSAGE, translation: 'shared', versionLabel: 'NIV', snapshotText: 'And…' };
    expect(withoutAppText(niv)).toBe(niv);
    expect(withoutAppText(PASSAGE)).toBe(PASSAGE);
    expect(withoutAppText(null)).toBeNull();
  });
});

describe('chipsWithoutAppText', () => {
  it('strips every chip in a body, however deep, and leaves the rest', () => {
    const body = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'See ' },
            chip({ ...PASSAGE, translation: 'BSB', snapshotText: 'x' }),
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [chip({ ...PASSAGE, translation: 'pasted', snapshotText: 'y' })],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(chipsWithoutAppText(body)).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'See ' }, chip(PASSAGE)] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [chip({ ...PASSAGE, translation: 'pasted', snapshotText: 'y' })],
                },
              ],
            },
          ],
        },
      ],
    });
  });
});
