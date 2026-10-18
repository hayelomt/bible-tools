import { describe, expect, it } from 'vitest';
import type { NoteLinkAttrs, SectionBody } from './doc.ts';
import { linksFor } from './links.ts';

const id = (n: number) => `0199e0a0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const to = (targetType: 'lesson' | 'section', n: number): NoteLinkAttrs => ({
  targetType,
  targetId: id(n),
  label: `Target ${n}`,
});
const body = (...links: NoteLinkAttrs[]): SectionBody => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'See ' },
        ...links.map((attrs) => ({ type: 'noteLink' as const, attrs })),
      ],
    },
  ],
});
const section = (b: SectionBody, deletedAt: string | null = null) => ({
  id: id(1),
  lessonId: id(2),
  body: b,
  deletedAt,
});

describe('linksFor', () => {
  it('gives one link per target, in the order first linked', () => {
    expect(linksFor(section(body(to('section', 5), to('lesson', 4), to('section', 5))))).toEqual([
      { fromSectionId: id(1), fromLessonId: id(2), targetType: 'section', targetId: id(5) },
      { fromSectionId: id(1), fromLessonId: id(2), targetType: 'lesson', targetId: id(4) },
    ]);
  });

  it('gives none for a section without links, or a deleted one', () => {
    expect(linksFor(section(body()))).toEqual([]);
    expect(linksFor(section(body(to('lesson', 4)), '2026-10-18T00:00:00.000Z'))).toEqual([]);
  });
});
