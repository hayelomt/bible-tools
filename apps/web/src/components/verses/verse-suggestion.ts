import type { BookText } from '@lamp/bible-data';
import { type BookCode, DEFAULT_TRANSLATION, type VerseRef } from '@lamp/domain';
import { type Editor, Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import { Suggestion, type SuggestionProps } from '@tiptap/suggestion';
import { shift } from '@floating-ui/dom';
import { bookState, snapshotText, whenBook } from '@/data/bible.ts';
import { findReference, type ReferenceEntry, referenceEntries } from './find-reference.ts';
import { LAPTOP_QUERY, type KeyHandler, VerseSuggestions } from './verse-suggestions.tsx';

export type PassageEntry = Extract<ReferenceEntry, { kind: 'passage' }>;
export type VerseSuggestionProps = SuggestionProps<ReferenceEntry, PassageEntry>;

const KEY = new PluginKey('verseSuggestion');
/** An atom (a chip) in the text before the cursor; not a letter or digit, so a reference starts after it. */
const LEAF = '￼';

/**
 * The verse autocomplete (F3, TECH-DESIGN §8.3, wireframes/verses.md): when the text just before
 * the cursor is a reference, a list offers the passages it could be, with the WEB text of the
 * selected one. Enter or a tap replaces the typed text with a `verse` chip holding the passage and
 * its snapshot; Escape closes the list and keeps the text. The list never takes focus.
 *
 * It runs before the section keys (priority), so Enter, Escape and the arrows go to the list
 * while it has something to insert.
 */
export const VerseSuggestion = Extension.create({
  name: 'verseSuggestion',
  priority: 1100,

  addProseMirrorPlugins() {
    return [
      Suggestion<ReferenceEntry, PassageEntry>({
        pluginKey: KEY,
        editor: this.editor,
        findSuggestionMatch: ({ $position }) => {
          if (!$position.parent.isTextblock) return null;
          const before = $position.parent.textBetween(0, $position.parentOffset, undefined, LEAF);
          const match = findReference(before);
          if (!match) return null;
          const from = $position.start() + match.from;
          return { range: { from, to: $position.pos }, query: match.text, text: match.text };
        },
        items: ({ query }) => referenceEntries(query),
        command: ({ editor, range, props: { ref } }) => {
          const book = bookState(ref.book);
          const attrs = {
            ...ref,
            translation: DEFAULT_TRANSLATION,
            ...(book.status === 'ready' && { snapshotText: snapshotText(book.text, ref) }),
          };
          // Still on its way: the text is added when it arrives. Not downloaded (offline): the
          // chip goes in without its text, which M2-11 fills in.
          if (book.status === 'loading') {
            void whenBook(ref.book).then((text) => text && fillSnapshots(editor, ref.book, text));
          }
          // A space follows the chip, so typing goes on; one that's already there is reused.
          const to =
            editor.state.doc.textBetween(range.to, range.to + 1) === ' ' ? range.to + 1 : range.to;
          editor
            .chain()
            .focus()
            .insertContentAt({ from: range.from, to }, [
              { type: 'verse', attrs },
              { type: 'text', text: ' ' },
            ])
            .run();
        },
        floatingUi: { strategy: 'fixed', middleware: [shift({ padding: 8 })] },
        render: () => {
          let renderer: ReactRenderer | undefined;
          let unmount: (() => void) | undefined;
          let onKey: KeyHandler | undefined;
          const onKeys = (handler: KeyHandler) => {
            onKey = handler;
          };
          return {
            onStart: (props) => {
              renderer = new ReactRenderer(VerseSuggestions, {
                editor: props.editor,
                props: { ...props, onKeys },
              });
              const element = renderer.element;
              element.style.zIndex = '50';
              unmount = props.mount(element, {
                // On a laptop the list hangs under the cursor; on a phone it sits above the
                // toolbar, placed by the list itself.
                onPosition: ({ x, y, strategy }) => {
                  const laptop = matchMedia(LAPTOP_QUERY).matches;
                  Object.assign(element.style, {
                    position: laptop ? strategy : '',
                    left: laptop ? `${x}px` : '',
                    top: laptop ? `${y}px` : '',
                  });
                },
              });
            },
            onUpdate: (props) => renderer?.updateProps({ ...props, onKeys }),
            onKeyDown: ({ event }) => onKey?.(event) ?? false,
            onExit: () => {
              unmount?.();
              renderer?.destroy();
            },
          };
        },
      }),
    ];
  },
});

/** Gives each chip on the book without its text (inserted while it was fetched) its snapshot. */
function fillSnapshots(editor: Editor, code: BookCode, text: BookText) {
  if (editor.isDestroyed) return;
  const { tr } = editor.state;
  editor.state.doc.descendants((node, pos) => {
    const ref = node.attrs as VerseRef;
    if (node.type.name !== 'verse' || ref.book !== code || ref.snapshotText) return;
    if (ref.translation !== DEFAULT_TRANSLATION) return;
    tr.setNodeAttribute(pos, 'snapshotText', snapshotText(text, ref));
  });
  // Not a step of its own for Undo: it completes the insert.
  if (tr.docChanged) editor.view.dispatch(tr.setMeta('addToHistory', false));
}
