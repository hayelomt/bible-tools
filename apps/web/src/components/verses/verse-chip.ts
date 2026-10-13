import type { BookText } from '@lamp/bible-data';
import {
  type BookCode,
  DEFAULT_TRANSLATION,
  TRANSLATION_NAMES,
  type TranslationId,
  type VerseRef,
} from '@lamp/domain';
import { type Editor, Extension, type NodeViewRenderer } from '@tiptap/core';
import { NodeSelection, Selection } from '@tiptap/pm/state';
import { useSyncExternalStore } from 'react';
import { onBookArrived, snapshotText, whenBook } from '@/data/bible.ts';

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

/**
 * A chip inserted before its book was here (still on its way, or not downloaded yet while offline)
 * holds no text; when the book arrives, it gets its snapshot (M2-11). Stored sections that aren't
 * open get theirs from `fillStoredSnapshots`.
 */
export const VerseSnapshots = Extension.create<unknown, { stop?: () => void }>({
  name: 'verseSnapshots',

  addStorage() {
    return {};
  },

  onCreate() {
    const { editor } = this;
    this.storage.stop = onBookArrived((code) => {
      if (!waitingFor(editor, code)) return;
      void whenBook(code).then((text) => text && fillSnapshots(editor, code, text));
    });
  },

  onDestroy() {
    this.storage.stop?.();
  },
});

function isWaiting(ref: VerseRef, code: BookCode): boolean {
  return ref.book === code && !ref.snapshotText && ref.translation === DEFAULT_TRANSLATION;
}

function waitingFor(editor: Editor, code: BookCode): boolean {
  let found = false;
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'verse' && isWaiting(node.attrs as VerseRef, code)) found = true;
    return !found;
  });
  return found;
}

function fillSnapshots(editor: Editor, code: BookCode, text: BookText) {
  if (editor.isDestroyed) return;
  const { tr } = editor.state;
  editor.state.doc.descendants((node, pos) => {
    const ref = node.attrs as VerseRef;
    if (node.type.name !== 'verse' || !isWaiting(ref, code)) return;
    // The node has every attribute, unset ones as null; a passage leaves them out.
    const passage = Object.fromEntries(Object.entries(ref).filter(([, v]) => v !== null));
    const snapshot = snapshotText(text, passage as VerseRef);
    if (snapshot) tr.setNodeAttribute(pos, 'snapshotText', snapshot);
  });
  // Not a step of its own for Undo: it completes the insert.
  if (tr.docChanged) editor.view.dispatch(tr.setMeta('addToHistory', false));
}
