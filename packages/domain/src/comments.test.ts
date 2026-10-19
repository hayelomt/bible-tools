import { describe, expect, it } from 'vitest';
import { commentBody, commentBodySchema, commentText, MAX_COMMENT_LENGTH } from './comments.ts';
import { newId, ownLessonId } from './ids.ts';
import { idSchema } from './schemas/common.ts';

describe('commentBody', () => {
  it('makes a chip of each reference, and a paragraph of each line', () => {
    const body = commentBody('Like the sheepfold walls.\nAnd Psalm 118:20, the gate of the LORD.');
    expect(body).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Like the sheepfold walls.' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'And ' },
            {
              type: 'verse',
              attrs: { book: 'PSA', chapter: 118, verseStart: 20, display: 'Psalm 118:20' },
            },
            { type: 'text', text: ', the gate of the LORD.' },
          ],
        },
      ],
    });
    expect(commentBodySchema.safeParse(body).success).toBe(true);
  });

  it('keeps a blank line, and drops the blank lines around the comment', () => {
    const body = commentBody('\n  One\n\nTwo\n\n');
    expect(body.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'One' }] },
      { type: 'paragraph' },
      { type: 'paragraph', content: [{ type: 'text', text: 'Two' }] },
    ]);
  });

  it('reads back as the text it was typed as, a chip as its reference', () => {
    expect(commentText(commentBody('See John 10:9 and Ps 23'))).toBe('See John 10:9 and Psalm 23');
  });
});

describe('commentBodySchema', () => {
  it('refuses an empty comment, one too long, and formatting', () => {
    expect(commentBodySchema.safeParse(commentBody('   ')).success).toBe(false);
    expect(commentBodySchema.safeParse(commentBody('a'.repeat(MAX_COMMENT_LENGTH))).success).toBe(
      true,
    );
    expect(
      commentBodySchema.safeParse(commentBody('a'.repeat(MAX_COMMENT_LENGTH + 1))).success,
    ).toBe(false);
    const bold = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi', marks: [] }] }],
    };
    expect(commentBodySchema.safeParse(bold).success).toBe(false);
    const heading = { type: 'doc', content: [{ type: 'heading', attrs: { level: 3 } }] };
    expect(commentBodySchema.safeParse(heading).success).toBe(false);
  });
});

describe('ownLessonId', () => {
  it('is the same UUIDv7 for the same pair, with the group lesson’s time', async () => {
    const userId = newId();
    const groupLessonId = newId();
    const id = await ownLessonId(userId, groupLessonId);
    expect(idSchema.safeParse(id).success).toBe(true);
    expect(id).toBe(await ownLessonId(userId, groupLessonId));
    expect(id.slice(0, 13)).toBe(groupLessonId.slice(0, 13));
    expect(await ownLessonId(newId(), groupLessonId)).not.toBe(id);
    expect(await ownLessonId(userId, newId())).not.toBe(id);
  });
});
