import type { Section, SectionBody } from '@lamp/domain';
import { EditorContent, useEditor } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SAVE_DELAY_MS } from '@/components/lesson/use-lesson-saver.ts';
import { hasText, toBody } from '@/components/sections/body.ts';
import { sectionExtensions } from '@/components/sections/extensions.ts';
import { EDITOR_CLASS } from '@/components/sections/section-editor.tsx';
import { RowNotFoundError } from '@/data/action.ts';
import { updateSection } from '@/data/actions/sections.ts';
import {
  addToThread,
  type ThreadSectionFields,
  type ThreadTarget,
} from '@/data/actions/group-thread.ts';
import { startVerseMatcher } from '@/verse-match/client.ts';

/** A section not stored yet: where it goes once it has text. */
export interface ThreadDraft {
  id: string;
  fields: Omit<ThreadSectionFields, 'id' | 'body'>;
}

interface ThreadEditorProps {
  /** The user's own group section; null for a draft. */
  section: Section | null;
  draft?: ThreadDraft;
  target: ThreadTarget;
  placeholder: string;
  label: string;
  /** The body a draft starts with (an answer's heading); an empty line otherwise. */
  initial?: SectionBody;
  focusOnMount?: boolean;
  /** A draft was stored. It stays here, edited as stored, until focus leaves it. */
  onStored?: (id: string) => void;
  /** Focus left: `stored` says whether the draft was stored, or it's still empty. */
  onLeave?: (stored: boolean) => void;
}

/**
 * The user's own section in a group thread (wireframes/sharing.md): the section editor's text,
 * chips and links, saved as it's typed, 500 ms after typing stops and at once on blur or when the
 * page is hidden, as a lesson's are. A draft is stored once it has text, in the group thread.
 * There's nothing to indent or drag here: a thread is ordered by when things were shared.
 */
export function ThreadEditor({
  section,
  draft,
  target,
  placeholder,
  label,
  initial,
  focusOnMount = false,
  onStored,
  onLeave,
}: ThreadEditorProps) {
  const id = section?.id ?? draft?.id ?? '';
  const stored = useRef(section !== null);
  const pending = useRef<SectionBody | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const writes = useRef(Promise.resolve());
  // The editor's handlers outlive renders; they read the latest props through this.
  const latest = useRef({ draft, target, onStored, onLeave, isDraft: section === null });
  useEffect(() => {
    latest.current = { draft, target, onStored, onLeave, isDraft: section === null };
    if (section) stored.current = true;
  });

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const body = pending.current;
    pending.current = undefined;
    if (body === undefined) return;
    writes.current = writes.current
      .then(async () => {
        if (stored.current) {
          await updateSection(id, { body });
          return;
        }
        const { draft: next, target: where, onStored: done } = latest.current;
        if (!next || !hasText(body)) return;
        await addToThread(where, { ...next.fields, id, body });
        stored.current = true;
        done?.(id);
      })
      .catch((error: unknown) => {
        // Deleted meanwhile, from another device or the menu: nothing left to save.
        if (error instanceof RowNotFoundError) return;
        console.error('Saving a group section failed', error);
      });
  }, [id]);

  const [extensions] = useState(() =>
    sectionExtensions({
      placeholder: () => placeholder,
      handlers: () => ({
        endSection: () => {},
        enterEmpty: () => {},
        indent: () => {},
        outdent: () => {},
        moveUp: () => {},
        moveDown: () => {},
        backspaceEmpty: () => false,
        leave: () => false,
      }),
    }),
  );
  const editor = useEditor({
    extensions,
    content: section?.body ?? initial,
    autofocus: focusOnMount ? 'end' : false,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
        class: EDITOR_CLASS,
      },
    },
    onUpdate: ({ editor: e }) => {
      pending.current = toBody(e.getJSON());
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    onFocus: () => startVerseMatcher(),
    onBlur: ({ editor: e }) => {
      flush();
      // The write is queued: a draft with text counts as stored from here.
      if (latest.current.isDraft) latest.current.onLeave?.(stored.current || !e.isEmpty);
    },
  });

  // A change from another device shows, unless this one is being typed in.
  const storedBody = section?.body;
  useEffect(() => {
    if (!editor || !storedBody || editor.isFocused || pending.current) return;
    if (JSON.stringify(toBody(editor.getJSON())) === JSON.stringify(storedBody)) return;
    editor.commands.setContent(storedBody, { emitUpdate: false });
  }, [editor, storedBody]);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  return <EditorContent editor={editor} data-thread-editor={id} />;
}
