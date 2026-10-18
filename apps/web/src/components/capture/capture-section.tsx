import { type SectionBody, toPlainText } from '@lamp/domain';
import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { cn } from 'cn';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { hasText, toBody } from '@/components/sections/body.ts';
import { SAVE_DELAY_MS } from '@/components/lesson/use-lesson-saver.ts';
import { createSection, updateSection } from '@/data/actions/sections.ts';
import { forgetUnsaved, keepUnsaved } from '@/data/unsaved.ts';
import { offsetLabel } from '@/lib/source-time.ts';
import { captureExtensions } from './extensions.ts';
import { isPlainBody } from './plain.ts';

/** A section on the capture screen: stored, or a draft that's stored once it has text. */
export interface CaptureRow {
  id: string;
  parentId: string | null;
  orderKey: string;
  body: SectionBody;
  /** When it started in the source; null until a draft is typed in. */
  sourceAt: string | null;
  stored: boolean;
  /** The stored row's; null for a draft. */
  updatedAt: string | null;
}

/** What a section asks of the capture screen. */
export interface CaptureApi {
  lessonId: string;
  /** Runs writes one after another, so the sections are stored in the order they were made. */
  enqueue: (write: () => Promise<unknown>) => void;
  /** Now, as sync's clock has it (§6.5), so times line up with the lesson's start. */
  now: () => string;
  register: (id: string, editor: Editor | null) => void;
  /** The section the verse box puts its chip in. */
  setCurrent: (id: string) => void;
  /** A draft was typed in: the time it started. */
  markStarted: (id: string, sourceAt: string) => void;
  /** Capture's keys (`CaptureKeys`), for the section `id` where it matters. */
  newSection: () => void;
  backspaceEmpty: (id: string) => boolean;
  verseBox: () => void;
}

const EMPTY_HINT = 'Type what you hear. Each section gets the time it started.';

/**
 * One section in capture mode (F26, wireframes/sermon.md): its time in the source, then plain
 * text and verse chips. It saves as the section editor does, 500 ms after typing stops, at once
 * when it loses focus and when the page is hidden; a draft is stored on its first character, with
 * that moment as its `sourceAt`. A section with formatting capture can't keep shows read-only.
 */
export const CaptureSection = memo(function CaptureSection({
  row,
  startedAt,
  api,
  first,
}: {
  row: CaptureRow;
  /** The lesson's `sourceStartedAt`, which the times count from. */
  startedAt: string | null;
  api: CaptureApi;
  /** The lesson has nothing else yet: the hint shows in its place. */
  first: boolean;
}) {
  const time = row.sourceAt && startedAt ? offsetLabel(row.sourceAt, startedAt) : null;
  const timeCell = (
    <span
      aria-hidden={!time}
      className="w-14 shrink-0 pt-0.5 text-sm text-muted-foreground tabular-nums lg:w-16 lg:pt-1"
    >
      {time}
      {time && <span className="sr-only">: </span>}
    </span>
  );
  return (
    <div data-capture-section={row.id} className={cn('flex gap-2', row.parentId && 'ml-6')}>
      {timeCell}
      {row.stored && !isPlainBody(row.body) ? (
        <p className="min-w-0 flex-1 text-muted-foreground whitespace-pre-line">
          {toPlainText(row.body)}
        </p>
      ) : (
        <CaptureEditor row={row} api={api} placeholder={first ? EMPTY_HINT : 'New section'} />
      )}
    </div>
  );
});

function CaptureEditor({
  row,
  api,
  placeholder,
}: {
  row: CaptureRow;
  api: CaptureApi;
  placeholder: string;
}) {
  const { id } = row;
  const apiRef = useRef(api);
  const stored = useRef(row.stored);
  const base = useRef(row.updatedAt);
  const sourceAt = useRef(row.sourceAt);
  const pending = useRef<SectionBody | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useLayoutEffect(() => {
    apiRef.current = api;
    if (row.stored) stored.current = true;
    base.current = row.updatedAt;
  });

  const flush = useCallback(
    (hiding = false) => {
      clearTimeout(timer.current);
      timer.current = undefined;
      const body = pending.current;
      pending.current = undefined;
      if (body === undefined) return;
      const capture = apiRef.current;
      const placement = { parentId: row.parentId, orderKey: row.orderKey };
      if (hiding && (stored.current || hasText(body))) {
        keepUnsaved({
          id,
          lessonId: capture.lessonId,
          ...placement,
          body,
          base: stored.current ? base.current : null,
          sourceAt: sourceAt.current,
        });
      }
      capture.enqueue(async () => {
        if (stored.current) {
          await updateSection(id, { body });
        } else if (hasText(body)) {
          await createSection({
            id,
            lessonId: capture.lessonId,
            ...placement,
            body,
            conflictOf: null,
            conflictDevice: null,
            sourceAt: sourceAt.current,
            sourcePage: null,
          });
          stored.current = true;
        }
        forgetUnsaved(id, body);
      });
    },
    [id, row.parentId, row.orderKey],
  );

  const [extensions] = useState(() =>
    captureExtensions({
      // On the editor's element (`data-hint`), so it follows the prop.
      placeholder: (editor) => editor.view.dom.dataset.hint ?? '',
      keys: () => {
        const capture = apiRef.current;
        return {
          newSection: () => capture.newSection(),
          backspaceEmpty: () => capture.backspaceEmpty(id),
          verseBox: () => capture.verseBox(),
        };
      },
    }),
  );
  const editorProps = useMemo(
    () => ({
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Section',
        'data-hint': placeholder,
        class: EDITOR_CLASS,
      },
      // Clear of the verse box and New section below.
      scrollMargin: { top: 16, bottom: 160, left: 0, right: 0 },
      scrollThreshold: { top: 16, bottom: 160, left: 0, right: 0 },
    }),
    [placeholder],
  );
  const editor = useEditor({
    extensions,
    content: row.body,
    editorProps,
    onUpdate: ({ editor: e }) => {
      const body = toBody(e.getJSON());
      // The time it started: the first character typed in a new section.
      if (!sourceAt.current && hasText(body)) {
        sourceAt.current = apiRef.current.now();
        apiRef.current.markStarted(id, sourceAt.current);
      }
      pending.current = body;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(), SAVE_DELAY_MS);
    },
    onFocus: () => apiRef.current.setCurrent(id),
    onBlur: () => flush(),
  });

  // `useEditor` has set the new hint by now; this redraws the placeholder.
  useEffect(() => {
    editor.view.dispatch(editor.state.tr.setMeta('hintChanged', placeholder));
  }, [editor, placeholder]);

  useEffect(() => {
    api.register(id, editor);
    return () => api.register(id, null);
  }, [api, id, editor]);

  // A change stored elsewhere shows, unless this section is being typed in.
  useEffect(() => {
    if (!row.stored || pending.current || editor.isFocused) return;
    if (JSON.stringify(toBody(editor.getJSON())) === JSON.stringify(row.body)) return;
    editor.commands.setContent(row.body, { emitUpdate: false });
  }, [editor, row.stored, row.body]);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush(true);
    };
    const onPageHide = () => flush(true);
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onPageHide);
      flush();
    };
  }, [flush]);

  return <EditorContent editor={editor} className="min-w-0 flex-1" />;
}

/** The reading font, larger on a laptop, with the placeholder from TipTap's extension. */
const EDITOR_CLASS = [
  'min-h-8 text-[17px] leading-[1.6] outline-none lg:text-xl',
  '[&_p+p]:mt-2',
  '[&_p.is-editor-empty:first-child]:before:pointer-events-none',
  '[&_p.is-editor-empty:first-child]:before:float-left',
  '[&_p.is-editor-empty:first-child]:before:h-0',
  '[&_p.is-editor-empty:first-child]:before:text-muted-foreground',
  '[&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]',
].join(' ');
