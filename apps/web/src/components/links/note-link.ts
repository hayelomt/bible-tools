import { type Editor, Extension, mergeAttributes, Node } from '@tiptap/core';
import { NodeSelection, PluginKey } from '@tiptap/pm/state';
import { ReactNodeViewRenderer, ReactRenderer } from '@tiptap/react';
import { Suggestion, type SuggestionProps } from '@tiptap/suggestion';
import { shift } from '@floating-ui/dom';
import { LAPTOP_QUERY, type KeyHandler } from '@/components/verses/verse-suggestions.tsx';
import { type LinkOption, linkOf, linkOptions, type LinkOptions } from './link-options.ts';
import { LinkSuggestions } from './link-suggestions.tsx';
import { NoteLinkView } from './note-link-view.tsx';

function linkField(name: string) {
  return {
    default: null,
    // All fields travel together in `data-note-link`, so copying a chip within the app keeps them.
    parseHTML: (el: HTMLElement) => JSON.parse(el.dataset.noteLink ?? '{}')[name] ?? null,
    renderHTML: () => ({}),
  };
}

/**
 * A link to another lesson or section inside a note (F23, TECH-DESIGN §17.4): an inline atom
 * holding the target and the title it had when the link was made. The chip shows the target's
 * title as it is now (`NoteLinkView`); `renderHTML` is what copying it writes.
 */
export const NoteLink = Node.create({
  name: 'noteLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      targetType: linkField('targetType'),
      targetId: linkField('targetId'),
      label: linkField('label'),
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-note-link]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-note-link': JSON.stringify(node.attrs) }),
      `→ ${node.attrs.label}`,
    ];
  },

  renderText({ node }) {
    return String(node.attrs.label);
  },

  addNodeView() {
    return ReactNodeViewRenderer(NoteLinkView, {
      as: 'span',
      // The chip takes its own clicks; the editor would only select it.
      stopEvent: ({ event }) => /^(mouse|pointer|click|touch)/.test(event.type),
    });
  },

  addKeyboardShortcuts() {
    // Enter or Space on a chip selected with the arrow keys opens it, as on a verse chip.
    const openSelected = ({ editor }: { editor: Editor }) => {
      const { selection } = editor.state;
      if (!(selection instanceof NodeSelection) || selection.node.type.name !== this.name) {
        return false;
      }
      const dom = editor.view.nodeDOM(selection.from);
      if (!(dom instanceof HTMLElement)) return false;
      (dom.querySelector('[data-slot="link-chip"]') ?? dom).dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
      return true;
    };
    return { Enter: openSelected, Space: openSelected };
  },
});

export type LinkSuggestionProps = SuggestionProps<LinkOptions, LinkOption>;

const KEY = new PluginKey('linkSuggestion');
/** An atom (a chip) in the text before the cursor. */
const LEAF = '￼';
/** `[[` and what's typed after it, up to the cursor: no brackets, one line. */
const TYPED = /\[\[([^[\]\n￼]{0,80})$/;

/** Whether the text before the cursor is a `[[` link being typed; the verse autocomplete waits. */
export const typingLink = (before: string): boolean => TYPED.test(before);

/**
 * The link picker (F23, wireframes/thinking.md "Link picker"): `[[` opens a list over lessons and
 * sections, narrowed by what's typed after it. Enter or a tap replaces `[[shep` with a link chip;
 * Escape closes the list and keeps the text. The list never takes focus. It runs before the
 * section keys and the verse autocomplete.
 */
export const LinkSuggestion = Extension.create({
  name: 'linkSuggestion',
  priority: 1150,

  addProseMirrorPlugins() {
    return [
      Suggestion<LinkOptions, LinkOption>({
        pluginKey: KEY,
        editor: this.editor,
        char: '[[',
        findSuggestionMatch: ({ $position }) => {
          if (!$position.parent.isTextblock) return null;
          const before = $position.parent.textBetween(0, $position.parentOffset, undefined, LEAF);
          const match = TYPED.exec(before);
          if (!match) return null;
          const from = $position.start() + match.index;
          return { range: { from, to: $position.pos }, query: match[1]!, text: match[0] };
        },
        // One result holding both lists, so the list can group them.
        items: async ({ query }) => [await linkOptions(query)],
        command: ({ editor, range, props: option }) => {
          const to =
            editor.state.doc.textBetween(range.to, range.to + 1) === ' ' ? range.to + 1 : range.to;
          editor
            .chain()
            .focus()
            .insertContentAt({ from: range.from, to }, [
              { type: 'noteLink', attrs: linkOf(option) },
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
              renderer = new ReactRenderer(LinkSuggestions, {
                editor: props.editor,
                props: { ...props, onKeys },
              });
              const element = renderer.element;
              element.style.zIndex = '50';
              unmount = props.mount(element, {
                // As the verse list: under the cursor on a laptop, above the toolbar on a phone.
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
