import type { Quarter, SectionBody } from '@lamp/domain';
import { type Editor, EditorContent, useEditor } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SAVE_DELAY_MS } from '@/components/lesson/use-lesson-saver.ts';
import { toBody } from '@/components/sections/body.ts';
import { sectionExtensions } from '@/components/sections/extensions.ts';
import { EDITOR_CLASS } from '@/components/sections/section-editor.tsx';
import { saveDraftSection } from '@/data/actions/digest.ts';
import { startVerseMatcher } from '@/verse-match/client.ts';

/** How the draft's sections pass the cursor between them. */
export interface DraftNavigation {
  register: (id: string, editor: Editor | null) => void;
  /** Moves the cursor to the section after (or before) this one; false when there's none. */
  move: (id: string, direction: 'up' | 'down') => boolean;
}

/**
 * One of the digest draft's sections (F32, M12-08): the section editor's text, chips and keys,
 * saved as it's typed like a lesson's, 500 ms after typing stops and at once on blur or when the
 * page is hidden. Enter on an empty last line, and the arrows at an edge, move to the next
 * section; there's nothing to indent, move or delete here.
 */
export function DraftSection({
  quarter,
  id,
  body,
  nav,
}: {
  quarter: Quarter;
  id: string;
  body: SectionBody;
  nav: DraftNavigation;
}) {
  const pending = useRef<SectionBody | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const navRef = useRef(nav);
  useEffect(() => {
    navRef.current = nav;
  });

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const next = pending.current;
    pending.current = undefined;
    if (next) void saveDraftSection(quarter, id, next);
  }, [quarter, id]);

  const [extensions] = useState(() =>
    sectionExtensions({
      placeholder: () => 'Write a note…',
      handlers: () => ({
        endSection: () => void navRef.current.move(id, 'down'),
        enterEmpty: () => void navRef.current.move(id, 'down'),
        indent: () => {},
        outdent: () => {},
        moveUp: () => {},
        moveDown: () => {},
        backspaceEmpty: () => false,
        leave: (direction) => navRef.current.move(id, direction),
      }),
    }),
  );
  const editor = useEditor({
    extensions,
    content: body,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Note',
        class: EDITOR_CLASS,
      },
    },
    onUpdate: ({ editor: e }) => {
      pending.current = toBody(e.getJSON());
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    onFocus: () => startVerseMatcher(),
    onBlur: () => flush(),
  });

  useEffect(() => {
    nav.register(id, editor);
    return () => nav.register(id, null);
  }, [nav, id, editor]);

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

  return <EditorContent editor={editor} />;
}
