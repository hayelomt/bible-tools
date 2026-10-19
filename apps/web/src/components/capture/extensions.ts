import { type Editor, Extension, type Extensions } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import { StarterKit } from '@tiptap/starter-kit';
import { Verse } from '@/components/sections/extensions.ts';
import { VerseChipKeys } from '@/components/verses/verse-chip.ts';

/** What capture mode's keys do beyond typing (wireframes/sermon.md "Capture mode"). */
export interface CaptureKeys {
  /** Enter on an empty last line, or Ctrl+Enter: a new section after the last. */
  newSection: () => void;
  /** Backspace in a section with nothing in it; true when handled. */
  backspaceEmpty: () => boolean;
  /** Ctrl+K: the quick verse box. */
  verseBox: () => void;
}

function isEmpty(editor: Editor): boolean {
  const { doc, selection } = editor.state;
  return selection.empty && doc.childCount === 1 && doc.firstChild?.childCount === 0;
}

function captureKeys(keys: () => CaptureKeys) {
  return Extension.create({
    name: 'captureKeys',
    priority: 1000,
    addKeyboardShortcuts() {
      return {
        Enter: ({ editor }) => {
          const { doc, selection } = editor.state;
          const { $from } = selection;
          const emptyLast =
            selection.empty &&
            $from.parent.childCount === 0 &&
            $from.index(0) === doc.childCount - 1;
          if (!emptyLast) return false;
          // The empty line goes, unless it's all there is.
          if (doc.childCount > 1) {
            editor
              .chain()
              .command(({ tr }) => {
                tr.delete($from.before(), $from.after());
                return true;
              })
              .run();
          }
          keys().newSection();
          return true;
        },
        'Mod-Enter': () => {
          keys().newSection();
          return true;
        },
        'Mod-k': () => {
          keys().verseBox();
          return true;
        },
        Backspace: ({ editor }) => isEmpty(editor) && keys().backspaceEmpty(),
        Escape: ({ editor }) => editor.commands.blur(),
      };
    },
  });
}

/**
 * Capture mode's editor (F26): plain text and verse chips only, no formatting, lists, links or
 * headings, so a paste comes in as plain text too. The body it makes is an ordinary section's.
 */
export function captureExtensions(options: {
  placeholder: (editor: Editor) => string;
  keys: () => CaptureKeys;
}): Extensions {
  return [
    StarterKit.configure({
      blockquote: false,
      bold: false,
      bulletList: false,
      code: false,
      codeBlock: false,
      hardBreak: false,
      heading: false,
      horizontalRule: false,
      italic: false,
      link: false,
      listItem: false,
      listKeymap: false,
      orderedList: false,
      strike: false,
      trailingNode: false,
      underline: false,
    }),
    Placeholder.configure({ placeholder: ({ editor }) => options.placeholder(editor) }),
    Verse,
    VerseChipKeys,
    captureKeys(options.keys),
  ];
}
