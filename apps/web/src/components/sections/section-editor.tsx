import { useSortable } from '@dnd-kit/sortable';
import { Button } from '@lamp/ui/components/button';
import { CSS } from '@dnd-kit/utilities';
import type { SectionBody } from '@lamp/domain';
import { resolveFocusPosition } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { cn } from 'cn';
import { ChevronRight } from 'lucide-react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SectionLinkedFrom } from '@/components/links/linked-from.tsx';
import { SectionTags } from '@/components/tags/section-tags.tsx';
import { createSection, updateSection } from '@/data/actions/sections.ts';
import { forgetUnsaved, keepUnsaved } from '@/data/unsaved.ts';
import { momentLabel } from '@/lib/dates.ts';
import { startVerseMatcher } from '@/verse-match/client.ts';
import { SAVE_DELAY_MS } from '@/components/lesson/use-lesson-saver.ts';
import { hasText, toBody } from './body.ts';
import { sectionExtensions } from './extensions.ts';
import { SectionHandle } from './section-handle.tsx';
import { MomentDialog, SectionMoment } from './section-moment.tsx';
import type { SectionListApi, SectionRow } from './section-list.tsx';

/**
 * Where to put the cursor in a section: its start or end, or where it was (after a move). Or
 * focus its handle, after the section menu was used.
 */
export interface FocusRequest {
  id: string;
  at: 'start' | 'end' | 'keep' | 'handle';
}

interface SectionEditorProps {
  row: SectionRow;
  api: SectionListApi;
  focus: FocusRequest | undefined;
  /** Briefly highlighted: opened from a tag page or a question's answer. */
  flash?: boolean;
  /** It takes part in a drag: everything but the empty section at the end. */
  sortable: boolean;
  /**
   * While a section is dragged: it's the slot where it would land (at that level, or null when it
   * can't land there), or it's one of its replies, folded away until the drop.
   */
  drag: { slot: 0 | 1 | null } | 'folded' | undefined;
  /** The only section, still a draft: it offers a template until something is typed (F25). */
  offerTemplate?: boolean;
}

const LABELS = { 0: 'Note', 1: 'Reply' } as const;
const PLACEHOLDERS = { 0: 'Write a note…', 1: 'Write a reply…' } as const;

/**
 * One section or reply: a TipTap editor that saves as it's typed (TECH-DESIGN §8.3). Changes are
 * stored 500 ms after typing stops, and at once on blur, when the page is hidden or closed and
 * when the row goes, so a section never has unsaved text for more than a second. A draft is
 * stored, with its id, once it has text. Memoized: the list mounts a long lesson's sections a few
 * at a time, and the ones already there needn't render again each time.
 */
export const SectionEditor = memo(function SectionEditor({
  row,
  api,
  focus,
  flash = false,
  sortable,
  drag,
  offerTemplate = false,
}: SectionEditorProps) {
  const { item, level } = row;
  const id = item.id;
  const { setNodeRef, setActivatorNodeRef, listeners, transform, transition } = useSortable({
    id,
    disabled: !sortable,
  });
  const handle = useRef<HTMLButtonElement>(null);
  const [editingTags, setEditingTags] = useState(false);
  const [empty, setEmpty] = useState(true);
  // Kept the same across renders, so the handle (and its menu) only renders when they change.
  const dragHold = useMemo(
    () => ({ ref: setActivatorNodeRef, listeners }),
    [setActivatorNodeRef, listeners],
  );
  const editTags = useCallback(() => setEditingTags(true), []);
  const [editingMoment, setEditingMoment] = useState(false);
  const editMoment = useCallback(() => setEditingMoment(true), []);
  const stored = useRef(item.stored);
  const pending = useRef<SectionBody | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The editor's key handlers outlive renders; they read the latest list through this.
  const apiRef = useRef(api);
  useLayoutEffect(() => {
    apiRef.current = api;
    if (item.stored) stored.current = true;
    base.current = item.updatedAt;
  });

  // The stored row's `updatedAt` this text is typed on (see `keepUnsaved`).
  const base = useRef(item.updatedAt);

  /** Stores waiting text. When the page is going away, it's also kept synchronously first. */
  const flush = useCallback(
    (hiding = false) => {
      clearTimeout(timer.current);
      timer.current = undefined;
      const body = pending.current;
      pending.current = undefined;
      if (body === undefined) return;
      const list = apiRef.current;
      if (hiding && (stored.current || hasText(body))) {
        keepUnsaved({
          id,
          lessonId: list.lessonId,
          ...list.placementOf(id),
          body,
          base: stored.current ? base.current : null,
        });
      }
      list.enqueue(async () => {
        if (stored.current) {
          await updateSection(id, { body });
        } else if (hasText(body)) {
          await createSection({
            id,
            lessonId: list.lessonId,
            ...list.placementOf(id),
            body,
            conflictOf: null,
            conflictDevice: null,
            sourceAt: null,
            sourcePage: null,
          });
          stored.current = true;
          list.markStored(id);
        }
        forgetUnsaved(id, body);
      });
      list.setDirty(id, false);
    },
    [id],
  );

  // The same options each render: TipTap compares them after every render and redraws the editor
  // when they differ (a new extensions array always does), and the list renders often.
  const [extensions] = useState(() =>
    sectionExtensions({
      // The level is on the editor's element (`data-level`), so the placeholder follows Tab.
      placeholder: (e) => PLACEHOLDERS[e.view.dom.dataset.level === '1' ? 1 : 0],
      handlers: () => {
        const list = apiRef.current;
        return {
          endSection: () => list.endSection(id),
          enterEmpty: () => list.enterEmpty(id),
          indent: () => list.indent(id),
          outdent: () => list.outdent(id),
          moveUp: () => list.moveUp(id),
          moveDown: () => list.moveDown(id),
          backspaceEmpty: () => list.backspaceEmpty(id),
          leave: (direction) => list.leave(id, direction),
        };
      },
    }),
  );
  // The name and placeholder follow the level when Tab or Shift+Tab changes it.
  const editorProps = useMemo(
    () => ({
      attributes: editorAttributes(level),
      // Keep the cursor clear of the toolbar on a phone.
      scrollMargin: { top: 16, bottom: 80, left: 0, right: 0 },
      scrollThreshold: { top: 16, bottom: 80, left: 0, right: 0 },
    }),
    [level],
  );
  const editor = useEditor({
    extensions,
    content: item.body,
    editorProps,
    onUpdate: ({ editor: e }) => {
      setEmpty(e.isEmpty);
      pending.current = toBody(e.getJSON());
      apiRef.current.setDirty(id, true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(), SAVE_DELAY_MS);
    },
    onFocus: () => {
      apiRef.current.setActive(id, true);
      // Ready by the first paste, usually (decided 2026-10-18); a lesson only read never starts it.
      startVerseMatcher();
    },
    onBlur: ({ editor: e }) => {
      flush(false);
      // Focus may come straight back (a section moved in the page); decide once it settles.
      setTimeout(() => {
        if (e.isDestroyed || e.isFocused) return;
        apiRef.current.setActive(id, false);
        apiRef.current.discardIfEmpty(id);
      }, 0);
    },
  });

  useEffect(() => {
    api.register(id, editor);
    return () => api.register(id, null);
  }, [api, id, editor]);

  // `useEditor` has set the new level's attributes by now; this redraws the placeholder.
  useEffect(() => {
    editor.view.dispatch(editor.state.tr.setMeta('levelChanged', level));
  }, [editor, level]);

  // At once, not in the next frame as TipTap's `focus` does: a key pressed straight after Enter or
  // Tab must land in the section the cursor moved to.
  useLayoutEffect(() => {
    if (!focus) return;
    if (focus.at === 'handle') {
      handle.current?.focus();
      return;
    }
    // After a move the editor still has its selection; it only needs focus back if it lost it.
    if (focus.at === 'keep') {
      if (!editor.view.hasFocus()) editor.view.focus();
      return;
    }
    const selection = resolveFocusPosition(editor.state.doc, focus.at);
    if (selection) editor.view.dispatch(editor.state.tr.setSelection(selection).scrollIntoView());
    editor.view.focus();
  }, [editor, focus]);

  // A change stored elsewhere (another tab, later a sync) shows, unless this section is being typed in.
  useEffect(() => {
    if (!item.stored || pending.current || editor.isFocused) return;
    if (JSON.stringify(toBody(editor.getJSON())) === JSON.stringify(item.body)) return;
    editor.commands.setContent(item.body, { emitUpdate: false });
  }, [editor, item.stored, item.body]);

  // Nothing typed is lost when the tab is hidden or closed, or the screen closes.
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

  const slot = typeof drag === 'object' ? drag.slot : undefined;
  const conflict = item.stored ? item.conflict : null;
  const labelId = `conflict-${id}`;
  return (
    <div
      ref={setNodeRef}
      data-section={id}
      className={cn(
        'group/section relative flex items-start gap-1',
        (slot === undefined ? level : slot) === 1 && 'ml-6',
        drag === 'folded' && 'hidden',
      )}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {slot !== undefined && (
        // Where the dragged section will land, at the level it will land at; the card above it
        // follows the pointer (DragPreview).
        <div
          aria-hidden
          className={cn(
            'absolute inset-0 z-10 rounded-lg border-2 border-dashed transition-colors',
            slot === null
              ? 'border-muted-foreground/40 bg-muted'
              : 'border-primary/60 bg-primary/10',
          )}
        />
      )}
      <div
        className={cn(
          'min-w-0 flex-1 rounded-r-md border-l-2 pl-3 transition-colors duration-700 focus-within:border-primary',
          conflict && 'rounded-lg border bg-muted/40 p-3',
          flash && 'border-primary bg-primary/10',
          slot !== undefined && 'invisible',
        )}
        data-flash={flash || undefined}
        {...(conflict && { role: 'group', 'aria-labelledby': labelId })}
      >
        {conflict && (
          <p id={labelId} className="mb-1 text-sm text-muted-foreground">
            Conflicted copy · {conflict.device ?? 'another device'} · {momentLabel(conflict.time)}
          </p>
        )}
        <SectionMoment moment={item} startedAt={api.sourceStartedAt} url={api.sourceUrl} />
        <EditorContent editor={editor} />
        {offerTemplate && empty && (
          <button
            type="button"
            onClick={() => api.pickTemplate(null)}
            className="-mx-1 flex items-center gap-0.5 rounded-md px-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
          >
            Start from a template
            <ChevronRight aria-hidden className="size-4" />
          </button>
        )}
        {item.stored && (
          <SectionLinkedFrom sectionId={id}>
            <SectionTags
              sectionId={id}
              editing={editingTags}
              onDone={(toHandle) => {
                setEditingTags(false);
                if (toHandle) handle.current?.focus();
              }}
            />
          </SectionLinkedFrom>
        )}
        {conflict && (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                flush();
                api.keepCopy(id);
              }}
            >
              Keep this instead
            </Button>
            <Button variant="outline" size="sm" onClick={() => api.remove(id)}>
              Delete
            </Button>
          </div>
        )}
      </div>
      {item.stored ? (
        <SectionHandle
          row={row}
          api={api}
          ref={handle}
          drag={dragHold}
          hidden={slot !== undefined}
          onEditTags={editTags}
          onEditMoment={editMoment}
        />
      ) : (
        // A draft has nothing to move or delete yet; the space keeps the text from shifting.
        <div aria-hidden className="w-8 shrink-0 pointer-coarse:w-11" />
      )}
      {item.stored && (
        <MomentDialog
          sectionId={id}
          moment={item}
          startedAt={api.sourceStartedAt}
          open={editingMoment}
          onOpenChange={setEditingMoment}
        />
      )}
    </div>
  );
});

function editorAttributes(level: 0 | 1): Record<string, string> {
  return {
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': LABELS[level],
    'data-level': String(level),
    class: EDITOR_CLASS,
  };
}

/** Note text in the reading font (UX-PATTERNS "Typography"), with the body's few block styles. */
const EDITOR_CLASS = [
  'min-h-11 text-[17px] leading-[1.6] outline-none',
  '[&_p+*]:mt-2 [&_*+p]:mt-2',
  '[&_h3]:font-semibold [&_h3]:text-lg',
  '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6',
  '[&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
  '[&_a]:text-primary [&_a]:underline',
  // The placeholder, from TipTap's Placeholder extension.
  '[&_p.is-editor-empty:first-child]:before:pointer-events-none',
  '[&_p.is-editor-empty:first-child]:before:float-left',
  '[&_p.is-editor-empty:first-child]:before:h-0',
  '[&_p.is-editor-empty:first-child]:before:text-muted-foreground',
  '[&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]',
].join(' ');
