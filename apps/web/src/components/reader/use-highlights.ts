import { HIGHLIGHT_COLOURS, passagesOverlap, type Highlight } from '@lamp/domain';
import { toast } from '@lamp/ui/components/sonner';
import { useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef } from 'react';
import {
  createHighlight,
  type PromoteTarget,
  promoteHighlight,
  removeHighlight,
  restoreHighlight,
  updateHighlight,
} from '@/data/actions/highlights.ts';
import { db } from '@/data/db.ts';
import type { Chapter } from '@/lib/chapters.ts';
import { highlightForSelection, highlightRef, type VerseSelection } from '@/lib/highlights.ts';
import { reportWriteError } from '@/lib/run-write.ts';

/**
 * The chapter's highlights, and the writes for the verses selected now (F8): a colour updates the
 * highlight of exactly those verses or stores a new one; a note does the same, in yellow when the
 * verses aren't highlighted yet.
 */
export function useHighlights(at: Chapter, selection: VerseSelection | null) {
  const stored = useLiveQuery(
    () =>
      db.highlight
        .filter(
          (row) =>
            row.deletedAt === null &&
            passagesOverlap(row.ref, { book: at.book, chapter: at.chapter }),
        )
        .toArray(),
    [at.book, at.chapter],
    [] as Highlight[],
  );
  const highlights = stored ?? [];
  const exact = selection ? highlightForSelection(highlights, at, selection) : null;
  const promoted = usePromotedSection(exact?.promotedSectionId ?? null);
  const navigate = useNavigate();

  const selectionRef = useRef(selection);
  const exactRef = useRef(exact);
  const idRef = useRef<string | null>(null);
  const writes = useRef(Promise.resolve());
  const key = selection ? `${selection.start}-${selection.end}` : '';
  const exactId = exact?.id ?? null;

  useEffect(() => {
    selectionRef.current = selection;
    exactRef.current = exact;
  });

  useEffect(() => {
    // `key` is read so a new range with no highlight of its own drops the previous one.
    idRef.current = key ? exactId : null;
  }, [key, exactId]);
  function enqueue(work: () => Promise<unknown>): Promise<void> {
    const run = writes.current.then(work);
    writes.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run.then(
      () => undefined,
      (error: unknown) => reportWriteError(error, 'a highlight'),
    );
  }

  /**
   * The new highlight is the one the next colour or note edits, unless the selection changed while
   * it was stored: then it belongs to verses no longer selected.
   */
  function adopt(from: VerseSelection, id: string) {
    const now = selectionRef.current;
    if (now?.start === from.start && now.end === from.end) idRef.current = id;
  }

  const storedRef = (current: VerseSelection) => highlightRef(at, current);

  function paint(colour: Highlight['colour']): Promise<void> {
    const current = selectionRef.current;
    if (!current) return Promise.resolve();
    return enqueue(async () => {
      const id = idRef.current;
      if (id) {
        if (exactRef.current?.colour !== colour) await updateHighlight(id, { colour });
        return;
      }
      const row = await createHighlight({
        ref: storedRef(current),
        colour,
        note: null,
        promotedSectionId: null,
      });
      adopt(current, row.id);
    });
  }

  function saveNote(text: string): Promise<void> {
    const current = selectionRef.current;
    if (!current) return Promise.resolve();
    const note = text.trim() ? text : null;
    return enqueue(async () => {
      const id = idRef.current;
      if (id) {
        await updateHighlight(id, { note });
        return;
      }
      if (!note) return;
      const row = await createHighlight({
        ref: storedRef(current),
        colour: HIGHLIGHT_COLOURS[0],
        note,
        promotedSectionId: null,
      });
      adopt(current, row.id);
    });
  }

  /**
   * Adds the selected verses to a lesson (M5-03), storing them as a yellow highlight first when
   * they aren't one yet, like a note does. A toast offers the lesson.
   */
  function promote(target: PromoteTarget): Promise<void> {
    const current = selectionRef.current;
    if (!current) return Promise.resolve();
    return enqueue(async () => {
      let id = idRef.current;
      if (!id) {
        const row = await createHighlight({
          ref: storedRef(current),
          colour: HIGHLIGHT_COLOURS[0],
          note: null,
          promotedSectionId: null,
        });
        adopt(current, row.id);
        id = row.id;
      }
      const { lesson, section } = await promoteHighlight(id, target);
      toast(`Added to ${lesson.title}.`, {
        duration: 10_000,
        action: {
          label: 'Open',
          onClick: () =>
            void navigate({
              to: '/lessons/$lessonId',
              params: { lessonId: lesson.id },
              search: { section: section.id },
            }),
        },
      });
    });
  }

  function removeCurrent(): Promise<void> {
    const id = exactRef.current?.id ?? idRef.current;
    if (!id) return Promise.resolve();
    return enqueue(async () => {
      await removeHighlight(id);
      if (idRef.current === id) idRef.current = null;
      toast('Highlight removed.', {
        duration: 10_000,
        action: {
          label: 'Undo',
          onClick: () => void enqueue(() => restoreHighlight(id)),
        },
      });
    });
  }

  /** The selected verses as a memory verse or chip takes them. */
  const selectedRef = selection ? storedRef(selection) : null;

  return { highlights, exact, promoted, selectedRef, paint, saveNote, promote, removeCurrent };
}

/** The section a highlight was added to, while it and its lesson are still there. */
function usePromotedSection(id: string | null) {
  return (
    useLiveQuery(async () => {
      const section = id ? await db.section.get(id) : undefined;
      if (!section || section.deletedAt !== null) return null;
      const lesson = await db.lesson.get(section.lessonId);
      return lesson?.deletedAt === null ? { lessonId: lesson.id, sectionId: section.id } : null;
    }, [id]) ?? null
  );
}
