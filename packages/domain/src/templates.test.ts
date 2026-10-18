import { describe, expect, it } from 'vitest';
import { bodySchema, toPlainText } from './doc.ts';
import { keysBetween } from './order.ts';
import {
  BUILT_IN_TEMPLATES,
  builtInTemplate,
  headedBody,
  isUntouchedHeading,
  sectionTitle,
  structureOf,
  templateStructureSchema,
  templateSummary,
} from './templates.ts';

describe('BUILT_IN_TEMPLATES', () => {
  it('are the four methods F25 names, each a valid structure', () => {
    expect(BUILT_IN_TEMPLATES.map((t) => [t.key, templateSummary(t.structure)])).toEqual([
      ['builtin:soap', 'Scripture · Observation · Application · Prayer'],
      ['builtin:inductive', 'Observe · Interpret · Apply'],
      ['builtin:lectio-divina', 'Read · Meditate · Pray · Contemplate'],
      [
        'builtin:verse-mapping',
        'The verse · Key words · Cross-references · Paraphrase · Application',
      ],
    ]);
    for (const template of BUILT_IN_TEMPLATES) {
      expect(templateStructureSchema.safeParse(template.structure).success).toBe(true);
    }
  });
});

describe('templateStructureSchema', () => {
  it('takes 1–30 sections, children one level deep', () => {
    expect(templateStructureSchema.safeParse([]).success).toBe(false);
    const many = Array.from({ length: 31 }, (_, i) => ({ title: `S${i}` }));
    expect(templateStructureSchema.safeParse(many).success).toBe(false);
    expect(
      templateStructureSchema.safeParse([{ title: 'Points', children: [{ title: 'One' }] }])
        .success,
    ).toBe(true);
    expect(
      templateStructureSchema.safeParse([
        { title: 'Points', children: [{ title: 'One', children: [{ title: 'Deeper' }] }] },
      ]).success,
    ).toBe(false);
    expect(templateStructureSchema.safeParse([{ title: 'x'.repeat(121) }]).success).toBe(false);
    expect(templateStructureSchema.safeParse([{ title: '  ' }]).success).toBe(false);
  });
});

describe('templateSummary', () => {
  it('counts a section’s children', () => {
    expect(
      templateSummary([
        { title: 'Main point' },
        { title: 'Points', children: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] },
        { title: 'Response' },
      ]),
    ).toBe('Main point · Points ↳ 3 · Response');
  });
});

describe('headedBody', () => {
  it('is a heading and an empty line, a valid body', () => {
    const body = headedBody('Observation');
    expect(bodySchema.parse(body)).toEqual(body);
    expect(toPlainText(body)).toBe('Observation');
  });
});

const paragraph = (text: string) => ({
  type: 'paragraph' as const,
  content: [{ type: 'text' as const, text }],
});

describe('sectionTitle and isUntouchedHeading', () => {
  it('read the heading a section starts with, and whether anything follows it', () => {
    const headed = headedBody('Observation');
    expect(sectionTitle(headed)).toBe('Observation');
    expect(isUntouchedHeading(headed)).toBe(true);

    const written = { ...headed, content: [headed.content[0]!, paragraph('He leads me.')] };
    expect(sectionTitle(written)).toBe('Observation');
    expect(isUntouchedHeading(written)).toBe(false);

    const plain = { type: 'doc' as const, content: [paragraph('Observation')] };
    expect(sectionTitle(plain)).toBeNull();
    expect(isUntouchedHeading(plain)).toBe(false);
    expect(sectionTitle(headedBody('x'.repeat(130)))).toHaveLength(120);
  });
});

/** A section of a lesson, headed with `title` and some text under it, or text alone. */
const section = (
  id: string,
  orderKey: string,
  title: string | null,
  parentId = null as string | null,
) => ({
  id,
  parentId,
  orderKey,
  body:
    title === null
      ? { type: 'doc' as const, content: [paragraph('Just text')] }
      : {
          type: 'doc' as const,
          content: [headedBody(title).content[0]!, paragraph('Written under it.')],
        },
});

describe('structureOf', () => {
  it('keeps the headings of sections and replies in order, not the text', () => {
    const [a, b, c] = keysBetween(null, null, 3) as [string, string, string];
    const structure = structureOf([
      section('3', c, 'Response'),
      section('1', a, 'Main point'),
      section('2', b, 'Points'),
      section('2b', b, 'Two', '2'),
      section('2a', a, 'One', '2'),
      section('2c', c, null, '2'),
      section('4', `${c}V`, null),
    ]);
    expect(structure).toEqual([
      { title: 'Main point' },
      { title: 'Points', children: [{ title: 'One' }, { title: 'Two' }] },
      { title: 'Response' },
    ]);
    expect(templateStructureSchema.safeParse(structure).success).toBe(true);
    expect(structureOf([section('1', a, null)])).toBeNull();
  });
});

describe('builtInTemplate', () => {
  it('finds a built-in by key', () => {
    expect(builtInTemplate('builtin:soap')?.name).toBe('SOAP');
    expect(builtInTemplate('builtin:gone')).toBeUndefined();
  });
});
