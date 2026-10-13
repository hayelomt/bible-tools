import { type Editor, Extension, type Extensions, mergeAttributes, Node } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import { Selection } from '@tiptap/pm/state';
import { StarterKit } from '@tiptap/starter-kit';

/**
 * The editor for one section (TECH-DESIGN §8.3), set up to produce only what a section body allows
 * (§4.2): paragraphs, h3 headings, lists, quotes, bold, italic, links and verse chips.
 */

/** What the section keys do beyond editing text; the list wires them to the other sections. */
export interface SectionKeyHandlers {
  /** Enter on an empty last line: that line goes, and a new section starts after this one. */
  endSection: () => void;
  /** Enter in a section with nothing in it. */
  enterEmpty: () => void;
  /** Tab outside a list: make this section a reply to the one above. */
  indent: () => void;
  /** Shift+Tab outside a list: move this reply out to the top level. */
  outdent: () => void;
  /** Alt+Shift+Up and Down: Move up and Move down from the section menu. */
  moveUp: () => void;
  moveDown: () => void;
  /** Backspace in a section with nothing in it; true when handled. */
  backspaceEmpty: () => boolean;
  /** Arrow up on the first line, or down on the last; true when focus moved to another section. */
  leave: (direction: 'up' | 'down') => boolean;
}

function verseField(name: string) {
  return {
    default: null,
    // All fields travel together in `data-verse`, so copying a chip within the app keeps them.
    parseHTML: (el: HTMLElement) => JSON.parse(el.dataset.verse ?? '{}')[name] ?? null,
    renderHTML: () => ({}),
  };
}

/**
 * A verse reference inside a note, stored with its snapshot (F3). An atom: the cursor and Backspace
 * treat it as one unit. M2-09 inserts it and M2-10 gives it its chip; until then it shows as text.
 */
export const Verse = Node.create({
  name: 'verse',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return Object.fromEntries(
      [
        'book',
        'chapter',
        'verseStart',
        'chapterEnd',
        'verseEnd',
        'display',
        'translation',
        'snapshotText',
      ].map((name) => [name, verseField(name)]),
    );
  },

  parseHTML() {
    return [{ tag: 'span[data-verse]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-verse': JSON.stringify(node.attrs),
        class: 'rounded-md bg-muted px-1 font-sans text-[0.9em] whitespace-nowrap',
      }),
      `${node.attrs.display} · ${node.attrs.translation}`,
    ];
  },

  renderText({ node }) {
    return String(node.attrs.display);
  },
});

/** Whether the selection is a cursor in a section with nothing but one empty paragraph. */
function isEmptySection(editor: Editor): boolean {
  const { doc, selection } = editor.state;
  const only = doc.firstChild;
  return (
    selection.empty && doc.childCount === 1 && only?.type.name === 'paragraph' && !only.childCount
  );
}

/**
 * Enter, Tab, Backspace and the arrows across sections (wireframes/lessons.md "Editing keys").
 * Runs before the built-in keymaps; each key falls through to them when it isn't about sections.
 */
function sectionKeys(handlers: () => SectionKeyHandlers) {
  return Extension.create({
    name: 'sectionKeys',
    priority: 1000,

    addKeyboardShortcuts() {
      return {
        Enter: ({ editor }) => {
          if (isEmptySection(editor)) {
            handlers().enterEmpty();
            return true;
          }
          const { doc, selection } = editor.state;
          const { $from } = selection;
          // An empty paragraph at the top level, last in the section, below something else.
          const last =
            selection.empty &&
            $from.depth === 1 &&
            $from.parent.type.name === 'paragraph' &&
            $from.parent.childCount === 0 &&
            $from.index(0) === doc.childCount - 1;
          if (!last) return false;
          editor
            .chain()
            .command(({ tr }) => {
              tr.delete($from.before(), $from.after());
              return true;
            })
            .run();
          handlers().endSection();
          return true;
        },
        // Inside a list, Tab and Shift+Tab indent the item as usual. Tab never leaves the editor,
        // so Escape is the way out for keyboard users (it blurs the editor).
        Tab: ({ editor }) => {
          if (editor.isActive('listItem')) editor.commands.sinkListItem('listItem');
          else handlers().indent();
          return true;
        },
        'Shift-Tab': ({ editor }) => {
          if (editor.isActive('listItem')) editor.commands.liftListItem('listItem');
          else handlers().outdent();
          return true;
        },
        Backspace: ({ editor }) => isEmptySection(editor) && handlers().backspaceEmpty(),
        ArrowUp: ({ editor }) => atEdge(editor, 'up') && handlers().leave('up'),
        ArrowDown: ({ editor }) => atEdge(editor, 'down') && handlers().leave('down'),
        'Alt-Shift-ArrowUp': () => {
          handlers().moveUp();
          return true;
        },
        'Alt-Shift-ArrowDown': () => {
          handlers().moveDown();
          return true;
        },
        Escape: ({ editor }) => editor.commands.blur(),
      };
    },
  });
}

/** Whether the cursor is on the first line of the first text block (or last of the last). */
function atEdge(editor: Editor, direction: 'up' | 'down'): boolean {
  const { state, view } = editor;
  if (!state.selection.empty || !view.endOfTextblock(direction)) return false;
  const edge = direction === 'up' ? Selection.atStart(state.doc) : Selection.atEnd(state.doc);
  return state.selection.$from.start() === edge.$from.start();
}

export function sectionExtensions(options: {
  placeholder: (editor: Editor) => string;
  handlers: () => SectionKeyHandlers;
}): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [3] },
      code: false,
      codeBlock: false,
      hardBreak: false,
      horizontalRule: false,
      strike: false,
      underline: false,
      trailingNode: false,
      link: {
        openOnClick: false,
        autolink: true,
        protocols: [],
        isAllowedUri: (url) => /^(https?:\/\/|mailto:)/i.test(url),
      },
    }),
    Placeholder.configure({ placeholder: ({ editor }) => options.placeholder(editor) }),
    Verse,
    sectionKeys(options.handlers),
  ];
}
