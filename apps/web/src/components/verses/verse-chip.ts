import { TRANSLATION_NAMES, type TranslationId, type VerseRef } from '@lamp/domain';
import { type Editor, Extension, type NodeViewRenderer } from '@tiptap/core';
import { NodeSelection, Selection } from '@tiptap/pm/state';
import { useSyncExternalStore } from 'react';

/** The chip open in the viewer, and where focus goes back to when it closes. */
export interface OpenChip {
  ref: VerseRef;
  /** The chip in the text; the popover hangs from it. */
  anchor: HTMLElement;
  editor: Editor;
  /** The editor's selection when it had focus as the chip opened; null when it didn't. */
  selection: Selection | null;
}

let open: OpenChip | null = null;
const listeners = new Set<() => void>();

function setOpen(chip: OpenChip | null) {
  open = chip;
  for (const listener of listeners) listener();
}

/** Opens a chip in the viewer (`VerseViewer`). */
export function openChip(editor: Editor, anchor: HTMLElement, ref: VerseRef) {
  setOpen({ ref, anchor, editor, selection: editor.isFocused ? editor.state.selection : null });
}

/**
 * Closes the viewer. If the editor had focus, it gets it back with the selection it had (the
 * chip itself, when it was opened from the keyboard), unless the text changed meanwhile.
 */
export function closeChip() {
  const chip = open;
  setOpen(null);
  if (!chip?.selection || chip.editor.isDestroyed) return;
  const { editor, selection } = chip;
  if (editor.state.doc.eq(selection.$anchor.doc)) {
    const restored = Selection.fromJSON(editor.state.doc, selection.toJSON());
    editor.view.dispatch(editor.state.tr.setSelection(restored));
  }
  editor.view.focus();
}

/** The chip open in the viewer, if any. */
export function useOpenChip(): OpenChip | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => open,
  );
}

/** "John 10:9, World English Bible, verse. Show text." (UX-PATTERNS "Verse references"). */
export function chipLabel(ref: Pick<VerseRef, 'display' | 'translation'>): string {
  const name = TRANSLATION_NAMES[ref.translation as TranslationId] ?? ref.translation;
  return `${ref.display}, ${name}, verse. Show text.`;
}

const CHIP_CLASS =
  'cursor-pointer rounded-md bg-muted px-1 font-sans text-[0.9em] whitespace-nowrap hover:bg-accent';
/** A chip selected as one unit, from the arrow keys. */
const SELECTED_CLASS = ['ring-2', 'ring-primary'];

/**
 * How a `verse` node shows in the editor (F3, wireframes/verses.md "Verse chip"): the display
 * reference and the translation label, read as a button. A tap or click opens the viewer without
 * moving the cursor (or opening the keyboard); the node is an atom, so the cursor and Backspace
 * treat it as one unit.
 */
export const verseChipView: NodeViewRenderer = ({ node: initial, editor }) => {
  let node = initial;
  const dom = document.createElement('span');
  dom.setAttribute('role', 'button');
  dom.setAttribute('aria-haspopup', 'dialog');
  dom.className = CHIP_CLASS;
  const render = () => {
    const ref = node.attrs as VerseRef;
    dom.textContent = `${ref.display} · ${ref.translation}`;
    dom.setAttribute('aria-label', chipLabel(ref));
  };
  render();
  // Keep focus (and the cursor) where it is; the click opens the chip.
  dom.addEventListener('mousedown', (event) => event.preventDefault());
  dom.addEventListener('click', () => openChip(editor, dom, node.attrs as VerseRef));
  return {
    dom,
    update: (updated) => {
      if (updated.type !== node.type) return false;
      node = updated;
      render();
      // Open in the viewer: it shows the change (its text arriving).
      if (open?.anchor === dom) setOpen({ ...open, ref: node.attrs as VerseRef });
      return true;
    },
    selectNode: () => dom.classList.add(...SELECTED_CLASS),
    deselectNode: () => dom.classList.remove(...SELECTED_CLASS),
    // The editor leaves the pointer to the chip.
    stopEvent: (event) => /^(mouse|pointer|click|touch)/.test(event.type),
    ignoreMutation: () => true,
  };
};

/**
 * Enter or Space on a chip selected with the arrow keys opens it. Runs before the section keys, so
 * Enter doesn't start a new line in its place.
 */
export const VerseChipKeys = Extension.create({
  name: 'verseChipKeys',
  priority: 1050,

  addKeyboardShortcuts() {
    return { Enter: openSelected, Space: openSelected };
  },
});

function openSelected({ editor }: { editor: Editor }): boolean {
  const { selection } = editor.state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'verse') return false;
  const anchor = editor.view.nodeDOM(selection.from);
  if (!(anchor instanceof HTMLElement)) return false;
  openChip(editor, anchor, selection.node.attrs as VerseRef);
  return true;
}
