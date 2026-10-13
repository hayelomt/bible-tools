import type { Lesson } from '@lamp/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RowNotFoundError, type RowPatch } from '@/data/action.ts';
import { createLesson, type LessonFields, updateLesson } from '@/data/actions/lessons.ts';
import { requestPersistence } from '@/data/storage.ts';

/** Typing settles for this long before it's stored (TECH-DESIGN §8.3 uses the same for notes). */
export const SAVE_DELAY_MS = 500;

export interface LessonSaver {
  /**
   * The lesson as shown: the stored row (or the draft until it has a title) with the changes not
   * stored yet on top, so a second change made before the first is stored builds on it.
   */
  values: LessonFields;
  /** Stores a change: at once, or after typing settles with `debounce`. */
  save: (patch: RowPatch<'lesson'>, options?: { debounce?: boolean }) => void;
  /** Stores a waiting change now (on blur, and when the screen closes). */
  flush: () => void;
  /** A change is waiting or being written. */
  saving: boolean;
}

/**
 * Autosave for the lesson screen (UX-PATTERNS "Saving and feedback"). A new lesson is a draft
 * until its title has text; then it's created with the id in the address, and later changes
 * update it. Writes run one after another, so an update never overtakes the create.
 */
export function useLessonSaver(
  id: string,
  lesson: Lesson | null,
  initial: () => LessonFields,
): LessonSaver {
  const [draft, setDraft] = useState(initial);
  const draftRef = useRef(draft);
  const stored = useRef(lesson !== null);
  const pending = useRef<RowPatch<'lesson'>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const writes = useRef(Promise.resolve());
  const [saving, setSaving] = useState(false);
  const [unstored, setUnstored] = useState<RowPatch<'lesson'>>({});

  // A change is shown from `unstored` until the stored row has it; then the row speaks again, so a
  // later change made elsewhere (the ⋯ menu, a sync) shows. Adjusted as the row arrives, in render.
  const [seen, setSeen] = useState(lesson);
  if (lesson !== seen) {
    setSeen(lesson);
    if (lesson) setUnstored((current) => withoutStored(current, lesson));
  }

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const patch = pending.current;
    pending.current = {};
    writes.current = writes.current
      .then(async () => {
        if (stored.current) {
          if (Object.keys(patch).length > 0) await updateLesson(id, patch);
        } else if (draftRef.current.title.trim()) {
          await createLesson({ ...draftRef.current, id });
          stored.current = true;
          void requestPersistence();
        }
      })
      .catch((error: unknown) => {
        // A lesson deleted from its own menu has nothing left to save.
        if (error instanceof RowNotFoundError) return;
        // The storage-full toast (states.md) will report this; the text stays on screen meanwhile.
        console.error('Saving the lesson failed', error);
      })
      .finally(() => {
        if (!timer.current && Object.keys(pending.current).length === 0) setSaving(false);
      });
  }, [id]);

  const save = useCallback<LessonSaver['save']>(
    (patch, { debounce = false } = {}) => {
      pending.current = { ...pending.current, ...patch };
      setUnstored((current) => ({ ...current, ...patch }));
      if (!stored.current) {
        draftRef.current = { ...draftRef.current, ...patch };
        setDraft(draftRef.current);
      }
      setSaving(true);
      clearTimeout(timer.current);
      if (debounce) timer.current = setTimeout(flush, SAVE_DELAY_MS);
      else flush();
    },
    [flush],
  );

  // Nothing typed is lost when the screen closes, the tab is hidden or the page goes away.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  return { values: { ...(lesson ?? draft), ...unstored }, save, flush, saving };
}

function withoutStored(unstored: RowPatch<'lesson'>, lesson: Lesson): RowPatch<'lesson'> {
  const left = Object.entries(unstored).filter(
    ([key, value]) => !sameValue(lesson[key as keyof Lesson], value),
  );
  return left.length === Object.keys(unstored).length ? unstored : Object.fromEntries(left);
}

/** Field values are plain data (strings, null, arrays of refs), so JSON compares them. */
function sameValue(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
