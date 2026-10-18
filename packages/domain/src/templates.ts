import { z } from 'zod';
import { type SectionBody, toPlainText } from './doc.ts';
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

/** The most sections (and replies to each) a template has, and its titles' longest. */
export const MAX_SECTIONS = 30;
export const MAX_TITLE = 120;
/** A template's name: one line, up to 80 characters. */
export const MAX_TEMPLATE_NAME = 80;

/** A template's sections: 1–30 of them, titles up to 120 characters, children one level deep. */
export const templateStructureSchema = z
  .array(
    z.strictObject({
      title: lineSchema(MAX_TITLE),
      children: z
        .array(z.strictObject({ title: lineSchema(MAX_TITLE) }))
        .max(MAX_SECTIONS)
        .optional(),
    }),
  )
  .min(1)
  .max(MAX_SECTIONS);

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

/** No kind of lesson starts with a template: the setting's default (§17.6). */
export const NO_DEFAULT_TEMPLATES = { sermon: null, personal: null, group: null } as const;

/** Templates named by a default: built-ins by key, the user's own by id. */
export function builtInTemplate(key: string): BuiltInTemplate | undefined {
  return BUILT_IN_TEMPLATES.find((template) => template.key === key);
}

/** The heading a section starts with, as a template title: its first block, when that's a heading. */
export function sectionTitle(body: SectionBody): string | null {
  const first = body.content[0];
  if (first?.type !== 'heading') return null;
  const title = toPlainText({ type: 'doc', content: [first] }).trim();
  return title === '' ? null : title.slice(0, MAX_TITLE).trim();
}

/**
 * Whether a section is still as a template made it: its heading and an empty line, nothing more
 * (`headedBody`). A lesson holding only these can take another kind's default instead (M10-14).
 */
export function isUntouchedHeading(body: SectionBody): boolean {
  const title = sectionTitle(body);
  if (title === null || body.content.length > 2) return false;
  const rest = body.content[1];
  return rest === undefined || (rest.type === 'paragraph' && !rest.content?.length);
}

/** A section of a lesson, as "Save as template…" reads it. */
interface OutlineSection {
  id: string;
  parentId: string | null;
  orderKey: string;
  body: SectionBody;
}

/**
 * A lesson's structure as a template (wireframes/thinking.md, "Save as template…"): the headings
 * of its sections and replies, in order, not the text. A section without a heading is left out,
 * with its replies; null when nothing is left.
 */
export function structureOf(sections: readonly OutlineSection[]): TemplateSection[] | null {
  const byOrder = (a: OutlineSection, b: OutlineSection) =>
    a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0;
  const structure: TemplateSection[] = [];
  for (const section of sections.filter((s) => s.parentId === null).toSorted(byOrder)) {
    const title = sectionTitle(section.body);
    if (title === null) continue;
    const children = sections
      .filter((s) => s.parentId === section.id)
      .toSorted(byOrder)
      .map((s) => sectionTitle(s.body))
      .filter((t) => t !== null)
      .slice(0, MAX_SECTIONS)
      .map((t) => ({ title: t }));
    structure.push(children.length > 0 ? { title, children } : { title });
  }
  return structure.length > 0 ? structure.slice(0, MAX_SECTIONS) : null;
}
