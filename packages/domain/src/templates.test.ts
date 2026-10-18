import { describe, expect, it } from 'vitest';
import { bodySchema, toPlainText } from './doc.ts';
import {
  BUILT_IN_TEMPLATES,
  headedBody,
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
