import { linkedTargets } from './doc.ts';
import type { Link, Section } from './schemas/entities.ts';

/** A link before it gets an id. */
export type LinkEntry = Omit<Link, 'id'>;

/**
 * The derived links of a section (F23, §17.4): one per target its link chips name, rebuilt from
 * the body on every write, on the device and on the server, exactly like `citationsFor`. A deleted
 * section links to nothing, and a target linked twice is indexed once.
 */
export function linksFor(
  section: Pick<Section, 'id' | 'lessonId' | 'body' | 'deletedAt'>,
): LinkEntry[] {
  if (section.deletedAt !== null) return [];
  const seen = new Set<string>();
  const entries: LinkEntry[] = [];
  for (const { targetType, targetId } of linkedTargets(section.body)) {
    if (seen.has(targetId)) continue;
    seen.add(targetId);
    entries.push({
      fromSectionId: section.id,
      fromLessonId: section.lessonId,
      targetType,
      targetId,
    });
  }
  return entries;
}
