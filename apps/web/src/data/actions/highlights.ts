import type { Highlight, Lesson, Section, SectionBody, VerseRef } from '@lamp/domain';
import { action, type NewRow, type RowPatch, RowNotFoundError } from '../action.ts';
import { db as appDb, type LampDb } from '../db.ts';
import { endOfLesson } from './section-order.ts';

/** Stores a highlight (F8). Its citation is rebuilt with the row, and the change is queued. */
export function createHighlight(
  fields: NewRow<'highlight'>,
  db: LampDb = appDb,
): Promise<Highlight> {
  return action(db, (w) => w.create('highlight', fields));
}

export function updateHighlight(
  id: string,
  patch: RowPatch<'highlight'>,
  db: LampDb = appDb,
): Promise<Highlight> {
  return action(db, (w) => w.update('highlight', id, patch));
}

/** Deletes at once; the reader offers Undo (UX-PATTERNS "Confirmations"). */
export function removeHighlight(id: string, db: LampDb = appDb): Promise<void> {
  return action(db, (w) => w.remove('highlight', id));
}

export function restoreHighlight(id: string, db: LampDb = appDb): Promise<void> {
  return action(db, (w) => w.restore('highlight', id));
}

/** A promoted highlight's section: the verse chip, then the note a paragraph a line. */
export function highlightBody(ref: VerseRef, note: string | null): SectionBody {
  const lines = (note ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'verse', attrs: ref }] },
      ...lines.map((text) => ({
        type: 'paragraph' as const,
        content: [{ type: 'text' as const, text }],
      })),
    ],
  };
}

/** Where a highlight goes: a lesson, or a new one dated `date` (the caller's today). */
export type PromoteTarget = { lessonId: string } | { newLesson: { date: string } };

/**
 * "Add to lesson" (F8, wireframes/reader.md): a top-level section at the end of the lesson with
 * the verse chip and the note, linked from the highlight by `promotedSectionId`. A new lesson is
 * titled with the reference, personal, with the passage as its main passage (decided 2026-10-14).
 * A highlight whose section is still there gets that one back instead of a second.
 */
export function promoteHighlight(
  id: string,
  target: PromoteTarget,
  db: LampDb = appDb,
): Promise<{ lesson: Lesson; section: Section }> {
  return action(db, async (w) => {
    const highlight = await w.db.highlight.get(id);
    if (!highlight || highlight.deletedAt !== null) throw new RowNotFoundError('highlight', id);
    if (highlight.promotedSectionId) {
      const section = await w.db.section.get(highlight.promotedSectionId);
      const lesson = section && (await w.db.lesson.get(section.lessonId));
      if (section?.deletedAt === null && lesson?.deletedAt === null) return { lesson, section };
    }

    let lesson: Lesson;
    if ('lessonId' in target) {
      const found = await w.db.lesson.get(target.lessonId);
      if (!found || found.deletedAt !== null) throw new RowNotFoundError('lesson', target.lessonId);
      lesson = found;
    } else {
      const { snapshotText: _text, ...passage } = highlight.ref;
      lesson = await w.create('lesson', {
        seriesId: null,
        title: highlight.ref.display,
        date: target.newLesson.date,
        kind: 'personal',
        speaker: null,
        church: null,
        mainPassages: [passage],
      });
    }
    const section = await w.create('section', {
      lessonId: lesson.id,
      parentId: null,
      orderKey: await endOfLesson(w, lesson.id),
      body: highlightBody(highlight.ref, highlight.note),
      conflictOf: null,
      conflictDevice: null,
    });
    await w.update('highlight', id, { promotedSectionId: section.id });
    return { lesson, section };
  });
}
