import { type Lesson, type Question, type Section, type Takeaway, toPlainText } from '@lamp/domain';
import MiniSearch from 'minisearch';

/** What free text search looks in (F6): lesson titles, sections, takeaways and questions. */
export const INDEXED_ENTITIES = ['lesson', 'section', 'takeaway', 'question'] as const;
export type IndexedEntity = (typeof INDEXED_ENTITIES)[number];

export function isIndexed(entity: string): entity is IndexedEntity {
  return (INDEXED_ENTITIES as readonly string[]).includes(entity);
}

interface IndexedRows {
  lesson: Lesson;
  section: Section;
  takeaway: Takeaway;
  question: Question;
}

/** One searchable row. Ids are UUIDs, unique across the entities. */
export interface SearchDoc {
  id: string;
  kind: IndexedEntity;
  lessonId: string;
  text: string;
}

/** A match: the row, its text, and the words in it that matched, for the snippet. */
export interface TextHit extends SearchDoc {
  /** As indexed (lower case, without accents). */
  terms: string[];
  score: number;
}

/** The text a row is found by; `null` for a deleted row or one with no text. */
export function docOf<E extends IndexedEntity>(kind: E, row: IndexedRows[E]): SearchDoc | null {
  if (row.deletedAt !== null) return null;
  let text: string;
  let lessonId: string;
  if (kind === 'lesson') {
    const lesson = row as Lesson;
    [text, lessonId] = [lesson.title, lesson.id];
  } else if (kind === 'section') {
    const section = row as Section;
    [text, lessonId] = [toPlainText(section.body), section.lessonId];
  } else {
    const item = row as Takeaway | Question;
    [text, lessonId] = [item.text, item.lessonId];
  }
  return text.trim() ? { id: row.id, kind, lessonId, text } : null;
}

/** Lower case and without accents, so "Élie" finds "elie". Also used for the snippet. */
export function normaliseTerm(term: string): string {
  return term.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** The most matches one search returns; plenty for a list someone reads. */
const MAX_HITS = 200;

/**
 * The free text index (TECH-DESIGN §8.4), kept in the search worker. Every word of the query must
 * match: the last as the start of a word, as it's still being typed, and longer words allowing a
 * typo.
 */
export class TextIndex {
  private readonly index = new MiniSearch<SearchDoc>({
    fields: ['text'],
    storeFields: ['kind', 'lessonId', 'text'],
    processTerm: normaliseTerm,
    searchOptions: {
      combineWith: 'AND',
      prefix: true,
      fuzzy: (term) => (term.length > 4 ? 0.2 : false),
    },
  });

  get size(): number {
    return this.index.documentCount;
  }

  addAll(docs: readonly SearchDoc[]): void {
    this.index.addAll(docs);
  }

  /** Brings one row up to date: `doc` null takes it out. */
  set(id: string, doc: SearchDoc | null): void {
    const has = this.index.has(id);
    if (doc && has) this.index.replace(doc);
    else if (doc) this.index.add(doc);
    else if (has) this.index.discard(id);
  }

  search(query: string): TextHit[] {
    return this.index
      .search(query)
      .slice(0, MAX_HITS)
      .map((r) => ({
        id: r.id as string,
        kind: r.kind as IndexedEntity,
        lessonId: r.lessonId as string,
        text: r.text as string,
        terms: r.terms,
        score: r.score,
      }));
  }
}
