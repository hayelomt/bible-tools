import { describe, expect, it } from 'vitest';
import {
  type Block,
  bodySchema,
  citedRefs,
  emptyBody,
  type InlineNode,
  linkedTargets,
  type LinkWriter,
  MAX_BODY_DEPTH,
  type NoteLinkAttrs,
  type Paragraph,
  type SectionBody,
  escapeMarkdown,
  toMarkdown,
  toNotionBlocks,
  toPlainText,
} from './doc.ts';
import type { VerseRef } from './verse-ref.ts';

const ROM_8_28: VerseRef = {
  book: 'ROM',
  chapter: 8,
  verseStart: 28,
  display: 'Romans 8:28',
  translation: 'BSB',
  snapshotText: 'We know that all things work together for good for those who love God.',
};
const JHN_3: VerseRef = { book: 'JHN', chapter: 3, display: 'John 3', translation: 'BSB' };
const ROM_8_38: VerseRef = {
  book: 'ROM',
  chapter: 8,
  verseStart: 38,
  chapterEnd: 9,
  verseEnd: 5,
  display: 'Romans 8:38–9:5',
  translation: 'BSB',
  snapshotText: 'For I am persuaded…\n…who is over all, God, blessed forever. Amen.',
};

const text = (value: string, ...marks: ('bold' | 'italic' | string)[]): InlineNode => {
  const node: InlineNode = { type: 'text', text: value };
  if (marks.length > 0) {
    node.marks = marks.map((m) =>
      m === 'bold' || m === 'italic' ? { type: m } : { type: 'link', attrs: { href: m } },
    );
  }
  return node;
};
const verse = (attrs: VerseRef): InlineNode => ({ type: 'verse', attrs });
const SHEPHERD: NoteLinkAttrs = {
  targetType: 'lesson',
  targetId: '0199e0a0-0000-7000-8000-000000000004',
  label: 'The Good Shepherd',
};
const OTHER_SHEEP: NoteLinkAttrs = {
  targetType: 'section',
  targetId: '0199e0a0-0000-7000-8000-000000000005',
  label: 'The Good Shepherd › “Other sheep I have…”',
};
const link = (attrs: NoteLinkAttrs): InlineNode => ({ type: 'noteLink', attrs });
const p = (...content: InlineNode[]): Paragraph =>
  content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
const doc = (...content: Block[]): SectionBody => ({ type: 'doc', content });

/** Uses every node and mark the schema allows. */
const RICH = doc(
  { type: 'heading', attrs: { level: 3 }, content: [text('Called according to his purpose')] },
  p(
    text('Paul says '),
    verse(ROM_8_28),
    text(' — '),
    text('all', 'bold', 'italic'),
    text(' things.'),
  ),
  p(),
  {
    type: 'bulletList',
    content: [
      { type: 'listItem', content: [p(text('Context: '), verse(JHN_3))] },
      {
        type: 'listItem',
        content: [
          p(text('Read the '), text('notes', 'https://example.org/notes')),
          {
            type: 'orderedList',
            attrs: { start: 3 },
            content: [{ type: 'listItem', content: [p(text('nested'))] }],
          },
        ],
      },
    ],
  },
  { type: 'blockquote', content: [p(text('Nothing can separate us. '), verse(ROM_8_38))] },
  p(text('Same idea as '), link(SHEPHERD), text('.')),
);

describe('bodySchema', () => {
  it('accepts every node and mark, and returns the body unchanged', () => {
    const json = JSON.parse(JSON.stringify(RICH));
    expect(bodySchema.parse(json)).toEqual(RICH);
    expect(JSON.stringify(bodySchema.parse(json))).toBe(JSON.stringify(RICH));
  });

  it('accepts the empty body', () => {
    expect(bodySchema.parse(emptyBody())).toEqual(emptyBody());
  });

  const reject: [string, unknown][] = [
    ['not an object', 'hello'],
    ['the wrong root', { type: 'paragraph' }],
    ['an empty document', doc()],
    ['an unknown block', { type: 'doc', content: [{ type: 'codeBlock', content: [] }] }],
    [
      'an unknown inline node',
      doc({ type: 'paragraph', content: [{ type: 'hardBreak' }] } as never),
    ],
    ['an unknown mark', doc(p({ type: 'text', text: 'x', marks: [{ type: 'strike' }] } as never))],
    ['an extra key on a node', doc({ type: 'paragraph', id: 'x' } as never)],
    [
      'an extra attribute on a mark',
      doc(p({ type: 'text', text: 'x', marks: [{ type: 'bold', attrs: {} }] } as never)),
    ],
    ['an empty text node', doc(p(text('')))],
    ['a repeated mark', doc(p(text('x', 'bold', 'bold')))],
    ['a javascript: link', doc(p(text('x', 'javascript:alert(1)')))],
    [
      'a heading level other than 3',
      doc({ type: 'heading', attrs: { level: 2 }, content: [text('x')] } as never),
    ],
    ['an empty list', doc({ type: 'bulletList', content: [] })],
    [
      'a list item that starts with a list',
      doc({
        type: 'bulletList',
        content: [{ type: 'listItem', content: [{ type: 'bulletList', content: [] }] }],
      } as never),
    ],
    ['a list item outside a list', doc({ type: 'listItem', content: [p()] } as never)],
    ['an empty blockquote', doc({ type: 'blockquote', content: [] })],
    [
      'a negative list start',
      doc({
        type: 'orderedList',
        attrs: { start: -1 },
        content: [{ type: 'listItem', content: [p()] }],
      }),
    ],
    ['a verse that does not exist', doc(p(verse({ ...ROM_8_28, verseStart: 40 })))],
    [
      'a verse in an unknown translation',
      doc(p(verse({ ...ROM_8_28, translation: 'ESV' } as never))),
    ],
    ['a verse with an extra field', doc(p(verse({ ...ROM_8_28, note: 'x' } as never)))],
    [
      'a verse without its display',
      doc(p({ type: 'verse', attrs: { book: 'ROM', chapter: 8 } } as never)),
    ],
    ['a link to an unknown kind of row', doc(p(link({ ...SHEPHERD, targetType: 'tag' } as never)))],
    ['a link to an id that is not a UUIDv7', doc(p(link({ ...SHEPHERD, targetId: 'x' })))],
    ['a link without a label', doc(p(link({ ...SHEPHERD, label: ' ' })))],
    ['a link label over 200 characters', doc(p(link({ ...SHEPHERD, label: 'x'.repeat(201) })))],
    ['a link with an extra attribute', doc(p(link({ ...SHEPHERD, href: 'x' } as never)))],
  ];
  it.each(reject)('rejects %s', (_, body) => {
    expect(bodySchema.safeParse(body).success).toBe(false);
  });

  it(`rejects nesting deeper than ${MAX_BODY_DEPTH} without overflowing the stack`, () => {
    let deep: Block = p(text('x'));
    for (let i = 0; i < 100_000; i++) deep = { type: 'blockquote', content: [deep] };
    expect(bodySchema.safeParse(doc(deep)).success).toBe(false);

    let ok: Block = p(text('x'));
    for (let i = 0; i < 10; i++) ok = { type: 'blockquote', content: [ok] };
    expect(bodySchema.safeParse(doc(ok)).success).toBe(true);
  });
});

describe('toPlainText', () => {
  it('gives one line per text block, with verses as their reference', () => {
    expect(toPlainText(RICH)).toBe(
      [
        'Called according to his purpose',
        'Paul says Romans 8:28 — all things.',
        'Context: John 3',
        'Read the notes',
        'nested',
        'Nothing can separate us. Romans 8:38–9:5',
        'Same idea as The Good Shepherd.',
      ].join('\n'),
    );
  });

  it('is empty for an empty body', () => {
    expect(toPlainText(emptyBody())).toBe('');
  });
});

describe('linkedTargets', () => {
  it('lists every link chip in document order, repeats included', () => {
    const body = doc(p(link(OTHER_SHEEP), verse(JHN_3)), p(link(SHEPHERD), link(OTHER_SHEEP)));
    expect(linkedTargets(body)).toEqual([OTHER_SHEEP, SHEPHERD, OTHER_SHEEP]);
    expect(linkedTargets(RICH)).toEqual([SHEPHERD]);
    expect(linkedTargets(emptyBody())).toEqual([]);
  });
});

describe('citedRefs', () => {
  it('lists every verse in document order, repeats included', () => {
    expect(citedRefs(RICH)).toEqual([ROM_8_28, JHN_3, ROM_8_38]);
    expect(citedRefs(doc(p(verse(JHN_3), verse(JHN_3))))).toEqual([JHN_3, JHN_3]);
    expect(citedRefs(emptyBody())).toEqual([]);
  });
});

/** A body with one chip of Romans 8:28, changed by `ref`. */
const outside = (ref: Partial<VerseRef>): SectionBody => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'verse', attrs: { ...ROM_8_28, ...ref } }] }],
});

describe('toMarkdown', () => {
  it('renders every node, with verse quotes after their paragraph', () => {
    expect(toMarkdown(RICH)).toBe(
      `### Called according to his purpose

Paul says Romans 8:28 (BSB) — ***all*** things.

> **Romans 8:28 (BSB)** We know that all things work together for good for those who love God.

- Context: John 3 (BSB)
- Read the [notes](https://example.org/notes)

  3. nested

> Nothing can separate us. Romans 8:38–9:5 (BSB)
>
> > **Romans 8:38–9:5 (BSB)** For I am persuaded…
> > …who is over all, God, blessed forever. Amen.

Same idea as The Good Shepherd.
`,
    );
  });

  it('writes a link chip as the relative reference the caller gives, or as deleted', () => {
    const files: LinkWriter = ({ targetId }) =>
      targetId === SHEPHERD.targetId
        ? { text: 'The Good [Shepherd]', href: '2026-10-12-the good-shepherd (1).md' }
        : null;
    const body = doc(p(text('As in '), link(SHEPHERD), text(' and '), link(OTHER_SHEEP)));
    expect(toMarkdown(body, { links: files })).toBe(
      'As in [The Good \\[Shepherd\\]](2026-10-12-the%20good-shepherd%20%281%29.md) and ' +
        'The Good Shepherd › “Other sheep I have…” (deleted)\n',
    );
    // A target the caller can't reference is its text alone.
    expect(toMarkdown(body, { links: (l) => ({ text: l.label }) })).toBe(
      'As in The Good Shepherd and The Good Shepherd › “Other sheep I have…”\n',
    );
  });

  it('is a single newline for an empty body', () => {
    expect(toMarkdown(emptyBody())).toBe('\n');
  });

  it('labels text from outside with its version, or as shared', () => {
    expect(toMarkdown(outside({ translation: 'shared', versionLabel: 'NIV' }))).toContain(
      '**Romans 8:28 (NIV)**',
    );
    expect(toMarkdown(outside({ translation: 'shared' }))).toContain('**Romans 8:28 (shared)**');
    expect(toMarkdown(outside({ translation: 'pasted' }))).toContain('**Romans 8:28 (pasted)**');
  });

  it('puts headings at the level asked for, under an export’s own', () => {
    expect(toMarkdown(RICH, { headingLevel: 2 })).toMatch(/^## Called according to his purpose\n/);
    expect(toMarkdown(RICH, { headingLevel: 4 })).toMatch(/^#### Called/);
  });

  it.each([
    [[text('a', 'bold'), text('b', 'bold')], '**ab**'],
    [[text('a', 'bold'), text('b', 'bold', 'italic'), text('c')], '**a*b***c'],
    [[text('bold ', 'bold'), text('plain')], '**bold** plain'],
    [[text('plain'), text(' bold', 'bold')], 'plain **bold**'],
    [
      [text('see '), text('this', 'italic', 'https://a.example/x_(y)')],
      'see [*this*](https://a.example/x_%28y%29)',
    ],
    [[text('x', 'bold'), verse(JHN_3)], '**x**John 3 (BSB)'],
    [[text('2*3 = [6] <b> a_b \\ `c`')], '2\\*3 = \\[6\\] \\<b\\> a\\_b \\\\ \\`c\\`'],
    [[text('# not a heading')], '\\# not a heading'],
    [[text('- not a list')], '\\- not a list'],
    [[text('1. not a list')], '1\\. not a list'],
    [[text('> not a quote')], '\\> not a quote'],
    [[text('#hashtag and 2024.')], '#hashtag and 2024.'],
    [
      [text('a', 'https://a.example'), text('b', 'https://b.example')],
      '[a](https://a.example)[b](https://b.example)',
    ],
  ] as [InlineNode[], string][])('renders inline %j as %j', (content, expected) => {
    expect(toMarkdown(doc(p(...content)))).toBe(`${expected}\n`);
  });

  it('keeps the marker of an empty list item', () => {
    const body = doc({ type: 'bulletList', content: [{ type: 'listItem', content: [p()] }] });
    expect(toMarkdown(body)).toBe('-\n');
  });

  it('numbers ordered lists from 1 by default and indents nested blocks', () => {
    const item = (s: string) => ({
      type: 'listItem' as const,
      content: [p(text(s))] as [Paragraph],
    });
    const body = doc({
      type: 'orderedList',
      content: [item('one'), { type: 'listItem', content: [p(text('two')), p(text('more'))] }],
    } as Block);
    expect(toMarkdown(body)).toBe('1. one\n2. two\n\n   more\n');
  });
});

describe('toNotionBlocks', () => {
  it('writes verse text as a quote with its reference under it, and quotes one level only', () => {
    expect(toNotionBlocks(RICH)).toEqual([
      '## Called according to his purpose',
      'Paul says Romans 8:28 (BSB) — ***all*** things.',
      '> We know that all things work together for good for those who love God.',
      '— Romans 8:28 (BSB)',
      '- Context: John 3 (BSB)\n- Read the [notes](https://example.org/notes)\n    3. nested',
      '> Nothing can separate us. Romans 8:38–9:5 (BSB)',
      '> For I am persuaded…\n> …who is over all, God, blessed forever. Amen.',
      '— Romans 8:38–9:5 (BSB)',
      'Same idea as The Good Shepherd.',
    ]);
  });

  it('quotes a reply whole, its headings in bold and its lists as lines of text', () => {
    expect(toNotionBlocks(RICH, { quoted: true, after: '#hope' })).toEqual([
      '> **Called according to his purpose**\n>\n> Paul says Romans 8:28 (BSB) — ***all*** things.',
      '> We know that all things work together for good for those who love God.',
      '— Romans 8:28 (BSB)',
      '> • Context: John 3 (BSB)\n>\n> • Read the [notes](https://example.org/notes)\n>\n> (3) nested\n>\n> Nothing can separate us. Romans 8:38–9:5 (BSB)',
      '> For I am persuaded…\n> …who is over all, God, blessed forever. Amen.',
      '— Romans 8:38–9:5 (BSB)',
      '> Same idea as The Good Shepherd.\n>\n> #hope',
    ]);
  });

  it('puts a lead before the first paragraph, or above a heading', () => {
    const lead = '[09:45](https://youtu.be/x?t=585)';
    expect(toNotionBlocks(doc(p(text('The door'))), { lead })).toEqual([`${lead} The door`]);
    expect(toNotionBlocks(RICH, { lead })[0]).toBe(lead);
    expect(toNotionBlocks(emptyBody(), { lead, quoted: true })).toEqual([`> ${lead}`]);
  });

  it('gives the verse after a list item that cites it', () => {
    const body = doc({
      type: 'bulletList',
      content: [{ type: 'listItem', content: [p(text('See '), verse(ROM_8_28))] }],
    });
    expect(toNotionBlocks(body)).toEqual([
      '- See Romans 8:28 (BSB)',
      '> We know that all things work together for good for those who love God.',
      '— Romans 8:28 (BSB)',
    ]);
  });
});

describe('escapeMarkdown', () => {
  it('shows one line of text as typed', () => {
    expect(escapeMarkdown('# Not a *heading*')).toBe('\\# Not a \\*heading\\*');
    expect(escapeMarkdown('1. not a list')).toBe('1\\. not a list');
    expect(escapeMarkdown('Who are the "other sheep"?')).toBe('Who are the "other sheep"?');
  });
});
