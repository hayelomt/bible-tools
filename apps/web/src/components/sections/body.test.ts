import { bodySchema, emptyBody, type SectionBody } from '@lamp/domain';
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { hasText, toBody } from './body.ts';
import { sectionExtensions } from './extensions.ts';

const ROM_8_28 = {
  book: 'ROM',
  chapter: 8,
  verseStart: 28,
  display: 'Romans 8:28',
} as const;
const NIV = {
  ...ROM_8_28,
  translation: 'shared',
  versionLabel: 'NIV',
  snapshotText: 'And we know that in all things God works for the good…',
} as const;

/** Every node and mark a body allows. */
const FULL: SectionBody = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'The door' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Jesus is ' },
        { type: 'text', text: 'the door', marks: [{ type: 'bold' }, { type: 'italic' }] },
        { type: 'text', text: ' ' },
        { type: 'verse', attrs: ROM_8_28 },
        { type: 'verse', attrs: NIV },
        { type: 'text', text: ' see', marks: [{ type: 'link', attrs: { href: 'https://x.org' } }] },
      ],
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
            {
              type: 'orderedList',
              attrs: { start: 3 },
              content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
            },
          ],
        },
      ],
    },
    {
      type: 'blockquote',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quoted' }] }],
    },
    { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'As in ' },
        {
          type: 'noteLink',
          attrs: {
            targetType: 'lesson',
            targetId: '0199e0a0-0000-7000-8000-000000000004',
            label: 'The Good Shepherd',
          },
        },
      ],
    },
  ],
};

/** A body holding one link chip with these attributes. */
const link = (attrs: object) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'noteLink', attrs }] }],
});

let editor: Editor | undefined;
afterEach(() => editor?.destroy());

/** A real editor with the section's extensions, holding `content`. */
function editorWith(content: unknown): Editor {
  editor = new Editor({
    extensions: sectionExtensions({
      placeholder: () => '',
      handlers: () => ({
        endSection: () => {},
        enterEmpty: () => {},
        indent: () => {},
        outdent: () => {},
        moveUp: () => {},
        moveDown: () => {},
        backspaceEmpty: () => false,
        leave: () => false,
      }),
    }),
    content: content as SectionBody,
  });
  return editor;
}

describe('toBody', () => {
  it('round-trips every allowed node through the editor, valid for the schema', () => {
    const body = toBody(editorWith(FULL).getJSON());
    expect(body).toEqual(FULL);
    expect(bodySchema.parse(body)).toEqual(FULL);
  });

  it('leaves out the BSB or KJV text a chip copied from an older app holds (decision 97)', () => {
    const old = { ...ROM_8_28, translation: 'KJV', snapshotText: 'And we know…' };
    const body = toBody({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'verse', attrs: old }] }],
    });
    expect(body.content[0]).toEqual({
      type: 'paragraph',
      content: [{ type: 'verse', attrs: ROM_8_28 }],
    });
  });

  it('keeps a link chip’s target and label, and drops one it can’t store', () => {
    const target = { targetType: 'section', targetId: '0199e0a0-0000-7000-8000-000000000005' };
    expect(toBody(link({ ...target, label: `  ${'x'.repeat(250)} ` }))).toEqual(
      link({ ...target, label: 'x'.repeat(200) }),
    );
    expect(toBody(link({ ...target, label: ' ' }))).toEqual(emptyBody());
    expect(toBody(link({ ...target, targetType: 'tag', label: 'x' }))).toEqual(emptyBody());
  });

  it('keeps an empty section as one empty paragraph', () => {
    expect(toBody(editorWith(emptyBody()).getJSON())).toEqual(emptyBody());
    expect(toBody({ type: 'doc', content: [] })).toEqual(emptyBody());
  });

  it('turns what the body has no place for into what it allows', () => {
    const pasted = editorWith(
      '<h1>Big</h1><p>a<br>b <s>gone</s> <code>x</code> <a href="javascript:alert(1)">bad</a></p><pre>code</pre><hr>',
    );
    const body = toBody(pasted.getJSON());
    expect(bodySchema.safeParse(body).success).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(
      /javascript|"type":"(code|codeBlock|strike|hardBreak|horizontalRule)"/,
    );
  });

  it('drops TipTap attributes the schema rejects', () => {
    const body = toBody({
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: { start: 1, type: null },
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'x',
                      marks: [
                        {
                          type: 'link',
                          attrs: { href: 'mailto:a@b.c', target: '_blank', rel: 'noopener' },
                        },
                        { type: 'bold' },
                        { type: 'bold' },
                      ],
                    },
                    { type: 'verse', attrs: { ...ROM_8_28, chapterEnd: null, verseEnd: null } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(bodySchema.parse(body)).toEqual(body);
    expect(body.content[0]).not.toHaveProperty('attrs');
  });
});

describe('hasText', () => {
  it('is true for text or a verse chip, false for blank lines', () => {
    expect(hasText(emptyBody())).toBe(false);
    expect(
      hasText(
        toBody({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '  ' }] }],
        }),
      ),
    ).toBe(false);
    expect(hasText(FULL)).toBe(true);
    expect(
      hasText({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'verse', attrs: ROM_8_28 }] }],
      }),
    ).toBe(true);
  });
});
