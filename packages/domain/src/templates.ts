import { z } from 'zod';
import type { SectionBody } from './doc.ts';
import { lineSchema } from './schemas/common.ts';

/**
 * Study-method templates (F25, TECH-DESIGN §17.6): named sections, with child sections one level
 * deep as the editor nests them. Applying one makes ordinary sections; nothing links back to it.
 */

export interface TemplateSection {
  title: string;
  /** Child sections: replies, one level deep. */
  children?: { title: string }[];
}

/** A template's sections: 1–30 of them, titles up to 120 characters, children one level deep. */
export const templateStructureSchema = z
  .array(
    z.strictObject({
      title: lineSchema(120),
      children: z
        .array(z.strictObject({ title: lineSchema(120) }))
        .max(30)
        .optional(),
    }),
  )
  .min(1)
  .max(30);

export interface BuiltInTemplate {
  /** How the default-per-kind setting names it (§17.6). */
  key: `builtin:${string}`;
  name: string;
  structure: readonly TemplateSection[];
}

/** The four built-ins (decision 64): part of the app, never rows, so they can't be deleted. */
export const BUILT_IN_TEMPLATES: readonly BuiltInTemplate[] = [
  {
    key: 'builtin:soap',
    name: 'SOAP',
    structure: [
      { title: 'Scripture' },
      { title: 'Observation' },
      { title: 'Application' },
      { title: 'Prayer' },
    ],
  },
  {
    key: 'builtin:inductive',
    name: 'Inductive',
    structure: [{ title: 'Observe' }, { title: 'Interpret' }, { title: 'Apply' }],
  },
  {
    key: 'builtin:lectio-divina',
    name: 'Lectio Divina',
    structure: [
      { title: 'Read' },
      { title: 'Meditate' },
      { title: 'Pray' },
      { title: 'Contemplate' },
    ],
  },
  {
    key: 'builtin:verse-mapping',
    name: 'Verse mapping',
    structure: [
      { title: 'The verse' },
      { title: 'Key words' },
      { title: 'Cross-references' },
      { title: 'Paraphrase' },
      { title: 'Application' },
    ],
  },
];

/** The picker's line under a template's name: "Main point · Points ↳ 3 · Response". */
export function templateSummary(structure: readonly TemplateSection[]): string {
  return structure
    .map(({ title, children }) => (children?.length ? `${title} ↳ ${children.length}` : title))
    .join(' · ');
}

/** A section headed with `title` (an `h3`) and an empty line to write in. */
export function headedBody(title: string): SectionBody {
  return {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: title }] },
      { type: 'paragraph' },
    ],
  };
}
