import { translationLabel, translationName, type VerseRef } from '@lamp/domain';
import { type Editor, Extension, type NodeViewRenderer } from '@tiptap/core';
import { NodeSelection, Selection } from '@tiptap/pm/state';
import { useSyncExternalStore } from 'react';
import { activeTranslation, onActiveTranslation } from '@/data/translation.ts';

/** The chip open in the viewer, and where focus goes back to when it closes. */
export interface OpenChip {
  ref: VerseRef;
  /** The chip in the text; the popover hangs from it. */
  anchor: HTMLElement;
  /** The note it's in; null for a chip in read-only text (the commentary), which takes focus back. */
  editor: Editor | null;
  /** The editor's selection when it had focus as the chip opened; null when it didn't. */
  selection: Selection | null;
  /** Opened by resting the pointer on it: focus stays in the note, and it closes as it leaves. */
  hover?: boolean;
}

let open: OpenChip | null = null;
const listeners = new Set<() => void>();

function setOpen(chip: OpenChip | null) {
  open = chip;
  for (const listener of listeners) listener();
}

/** Opens a chip in the viewer (`VerseViewer`); one open on hover stays open. */
export function openChip(editor: Editor | null, anchor: HTMLElement, ref: VerseRef) {
  cancelHover();
  if (open?.hover && open.anchor === anchor) {
    setOpen({ ...open, hover: false });
    return;
  }
  const selection = editor?.isFocused ? editor.state.selection : null;
  setOpen({ ref, anchor, editor, selection });
}

/**
 * Closes the viewer. If the editor had focus, it gets it back with the selection it had (the
 * chip itself, when it was opened from the keyboard), unless the text changed meanwhile; a chip
 * in read-only text gets focus itself. One opened on hover never took focus, so there's nothing
 * to give back.
 */
export function closeChip() {
  const chip = open;
  cancelHover();
  setOpen(null);
  if (!chip || chip.hover) return;
  if (!chip.editor) {
    if (chip.anchor.isConnected) chip.anchor.focus();
    return;
  }
  if (!chip.selection || chip.editor.isDestroyed) return;
  const { editor, selection } = chip;
  if (editor.state.doc.eq(selection.$anchor.doc)) {
    const restored = Selection.fromJSON(editor.state.doc, selection.toJSON());
    editor.view.dispatch(editor.state.tr.setSelection(restored));
  }
  editor.view.focus();
}

/** Closes the viewer without giving focus back: the user is leaving for another screen. */
export function leaveChip() {
  cancelHover();
  setOpen(null);
}

/** Resting the pointer on a chip this long opens it; leaving it (and its popover) this long closes it. */
const HOVER_OPEN_MS = 400;
const HOVER_CLOSE_MS = 250;
/** Hover opens a chip on a laptop with a mouse (`LAPTOP_QUERY`); a phone's sheet opens on a tap. */
const HOVER_QUERY = '(min-width: 1024px) and (hover: hover) and (pointer: fine)';
let hoverTimer: ReturnType<typeof setTimeout> | undefined;

function cancelHover() {
  clearTimeout(hoverTimer);
  hoverTimer = undefined;
}

/** Opens a chip after the pointer rests on it, on a laptop with a mouse. */
export function hoverOpen(editor: Editor | null, anchor: HTMLElement, ref: () => VerseRef) {
  if (!window.matchMedia(HOVER_QUERY).matches) return;
  // One opened by a click or the keyboard stays until it's closed.
  if (open && !open.hover) return;
  cancelHover();
  if (open?.anchor === anchor) return;
  hoverTimer = setTimeout(() => {
    if (!anchor.isConnected || editor?.isDestroyed) return;
    setOpen({ ref: ref(), anchor, editor, selection: null, hover: true });
  }, HOVER_OPEN_MS);
}

/** The pointer left a chip or its popover: one open on hover closes unless it comes back. */
export function hoverLeave() {
  cancelHover();
  if (!open?.hover) return;
  hoverTimer = setTimeout(closeChip, HOVER_CLOSE_MS);
}

/** The pointer is on the popover of a chip open on hover: it stays open. */
export function hoverStay() {
  if (open?.hover) cancelHover();
}

/** Whether `target` is in the chip open in the viewer. */
export function chipAt(target: Node): boolean {
  return !!open?.anchor.contains(target);
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

/** "John 10:9, Berean Standard Bible, verse. Show text." (UX-PATTERNS "Verse references"). */
export function chipLabel(ref: Pick<VerseRef, 'display' | 'translation' | 'versionLabel'>): string {
  return `${ref.display}, ${translationName(ref, activeTranslation())}, verse. Show text.`;
}

/** What shows for a chip without text: its book is on its way, or, from outside, none came with it. */
export const missingText = (ref: Pick<VerseRef, 'translation'>): string =>
  ref.translation ? 'No text came with it.' : 'Text not downloaded yet.';

export const CHIP_CLASS =
  'cursor-pointer rounded-md bg-muted px-1 font-sans text-[0.9em] whitespace-nowrap hover:bg-accent';
/** A chip selected as one unit, from the arrow keys. */
const SELECTED_CLASS = ['ring-2', 'ring-primary'];

/**
 * How a `verse` node shows in the editor (F3, wireframes/verses.md "Verse chip"): the display
 * reference and the translation label, the one picked in Settings for the app's own text, read as
 * a button. A tap or click opens the viewer without
 * moving the cursor (or opening the keyboard); on a laptop, so does resting the mouse on it. The
 * node is an atom, so the cursor and Backspace treat it as one unit.
 */
export const verseChipView: NodeViewRenderer = ({ node: initial, editor }) => {
  let node = initial;
  const dom = document.createElement('span');
  dom.setAttribute('role', 'button');
  dom.setAttribute('aria-haspopup', 'dialog');
  dom.className = CHIP_CLASS;
  dom.dataset['slot'] = 'verse-chip';
  const render = () => {
    const ref = node.attrs as VerseRef;
    dom.textContent = `${ref.display} · ${translationLabel(ref, activeTranslation())}`;
    dom.setAttribute('aria-label', chipLabel(ref));
  };
  // Called at once, and again when another translation is picked.
  const stop = onActiveTranslation(render);
  // Keep focus (and the cursor) where it is; the click opens the chip.
  dom.addEventListener('mousedown', (event) => event.preventDefault());
  dom.addEventListener('click', () => openChip(editor, dom, node.attrs as VerseRef));
  dom.addEventListener('mouseenter', () => hoverOpen(editor, dom, () => node.attrs as VerseRef));
  dom.addEventListener('mouseleave', hoverLeave);
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
    destroy: stop,
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
