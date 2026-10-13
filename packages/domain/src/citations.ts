import { citedRefs } from './doc.ts';
import type { Citation, EntityName, EntityRow } from './schemas/entities.ts';
import { passageRange, type Passage } from './verse-ref.ts';

/** A citation before it gets an id. */
export type CitationEntry = Omit<Citation, 'id'>;

/** The entities whose rows cite verses, and so feed the verse index (§5.2). */
export const CITING_ENTITIES = ['lesson', 'section', 'highlight', 'memoryItem'] as const;
export type CitingEntity = (typeof CITING_ENTITIES)[number];

export function isCitingEntity(entity: EntityName): entity is CitingEntity {
  return (CITING_ENTITIES as readonly string[]).includes(entity);
}

/**
 * The derived citations of a row (§5.2): a lesson's main passages, a section's verse chips, a
 * highlight's or memory item's passage. Rebuilt from the row on every write, on the device and on
 * the server, so both agree. A deleted row cites nothing, and a passage cited twice by the same row
 * is indexed once.
 */
export function citationsFor<E extends CitingEntity>(
  entity: E,
  row: EntityRow<E>,
): CitationEntry[] {
  if (row.deletedAt !== null) return [];
  const [sourceType, lessonId, passages] = sourcesOf(entity, row as EntityRow<CitingEntity>);
  const seen = new Set<string>();
  const entries: CitationEntry[] = [];
  for (const passage of passages) {
    const [startOrd, endOrd] = passageRange(passage);
    const key = `${startOrd}-${endOrd}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ sourceType, sourceId: row.id, lessonId, book: passage.book, startOrd, endOrd });
  }
  return entries;
}

function sourcesOf(
  entity: CitingEntity,
  row: EntityRow<CitingEntity>,
): [Citation['sourceType'], string | null, readonly Passage[]] {
  switch (entity) {
    case 'lesson': {
      const lesson = row as EntityRow<'lesson'>;
      return ['lesson', lesson.id, lesson.mainPassages];
    }
    case 'section': {
      const section = row as EntityRow<'section'>;
      return ['section', section.lessonId, citedRefs(section.body)];
    }
    case 'highlight':
      return ['highlight', null, [(row as EntityRow<'highlight'>).ref]];
    case 'memoryItem':
      return ['memory_item', null, [(row as EntityRow<'memoryItem'>).ref]];
  }
}
