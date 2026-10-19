import { findReferences } from '@lamp/domain';
import { type Editor, Extension } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import type { Node as PmNode } from '@tiptap/pm/model';
import { type EditorState, Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { useSyncExternalStore } from 'react';
import { pasteChipsOn } from '@/data/translation.ts';
import { type PasteChip, readPaste } from '@/paste/read-paste.ts';
import { matchVerseText } from '@/verse-match/client.ts';

/** A chip pasting could make, placed in the document. */
export interface PlacedChip extends PasteChip {
  /** The document positions it replaces, kept current as the document changes. */
  at: { from: number; to: number };
}

/** A paste waiting to be read (`chips` null), or read, with the chips it could make. */
interface PasteState {
  id: number;
  from: number;
  to: number;
  chips: PlacedChip[] | null;
}

const KEY = new PluginKey<PasteState | null>('pasteChips');
/** An atom (a chip) in the pasted text; not a letter, so no reference runs through it. */
const LEAF = '￼';
let pastes = 0;

/** The prompt on screen: one for the page, for the editor pasted into last. */
export interface PastePrompt {
  /** The paste's id: a new paste is a new prompt. */
  id: number;
  editor: Editor;
  chips: PlacedChip[];
  /** Where the paste ends, to hang the prompt under on a laptop. */
  end: number;
}
let prompt: PastePrompt | null = null;
const listeners = new Set<() => void>();

function setPrompt(next: PastePrompt | null) {
  if (next === prompt) return;
  prompt = next;
  for (const listener of listeners) listener();
}

export function usePastePrompt(): PastePrompt | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => prompt,
  );
}

/**
 * Paste intelligence in a section (F19, M9-08, wireframes/interop.md "Paste prompt"). A paste goes
 * in exactly as copied; then its text is read for references (M9-03) and, when the matcher is
 * ready, whole BSB and KJV verses (M9-04), and `PasteChipsPrompt` offers a chip for each. Nothing
 * changes until a tap (or Alt+Enter). The offer goes on ✕, Escape, leaving the note or typing; a
 * change that isn't the user's (a chip's text arriving) only moves it. Off with
 * `UserSettings.pasteChips`.
 */
export const PasteChips = Extension.create({
  name: 'pasteChips',
  // Before the verse list (1100), which reads this plugin's state to stay shut while a paste is
  // offered, and the section keys (1000), which blur on Escape.
  priority: 1200,

  addKeyboardShortcuts() {
    return {
      Escape: ({ editor }) => {
        if (!KEY.getState(editor.state)) return false;
        dismissPaste(editor);
        return true;
      },
      'Alt-Enter': ({ editor }) => {
        const chips = KEY.getState(editor.state)?.chips;
        if (!chips?.length) return false;
        makePasteChips(editor, chips);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const { editor } = this;
    return [
      new Plugin<PasteState | null>({
        key: KEY,
        state: {
          init: () => null,
          apply(tr, value, oldState, newState) {
            const meta = tr.getMeta(KEY) as PasteState | null | undefined;
            if (meta !== undefined) return meta;
            if (tr.getMeta('paste') && pasteChipsOn()) {
              const from = tr.mapping.map(oldState.selection.from, -1);
              return { id: ++pastes, from, to: newState.selection.to, chips: null };
            }
            if (!value || !tr.docChanged) return value;
            // The user's own change ends the offer; anything else moves it.
            if (tr.getMeta('addToHistory') !== false) return null;
            return mapped(value, tr);
          },
        },
        props: {
          handleDOMEvents: {
            blur: (view) => {
              if (KEY.getState(view.state)) view.dispatch(clear(view.state.tr));
              return false;
            },
          },
        },
        view: () => ({
          update: (view) => {
            const state = KEY.getState(view.state);
            if (state && state.chips === null) void read(view, state);
            if (state?.chips?.length) setPrompt(placed(editor, state));
            else if (prompt?.editor === editor) setPrompt(null);
          },
          destroy: () => {
            if (prompt?.editor === editor) setPrompt(null);
          },
        }),
      }),
    ];
  },
});

/** The same prompt object while nothing changed, so the store doesn't re-render for nothing. */
function placed(editor: Editor, state: PasteState): PastePrompt {
  if (prompt?.editor === editor && prompt.chips === state.chips) return prompt;
  return { id: state.id, editor, chips: state.chips!, end: state.to };
}

function mapped(state: PasteState, tr: Transaction): PasteState {
  return {
    ...state,
    from: tr.mapping.map(state.from, -1),
    to: tr.mapping.map(state.to, 1),
    chips:
      state.chips?.map((chip) => ({
        ...chip,
        at: { from: tr.mapping.map(chip.at.from, 1), to: tr.mapping.map(chip.at.to, -1) },
      })) ?? null,
  };
}

const clear = (tr: Transaction) => tr.setMeta(KEY, null).setMeta('addToHistory', false);

const reading = new Set<number>();

/** Reads the paste and offers its chips, unless the paste is gone or changed meanwhile. */
async function read(view: EditorView, state: PasteState) {
  if (reading.has(state.id)) return;
  reading.add(state.id);
  try {
    const doc = view.state.doc;
    const { text, posAt } = textOf(doc, state.from, state.to);
    const hints = findReferences(text).map((found) => found.ref);
    // A matcher still building finds nothing this time; the references are offered meanwhile.
    const matches = await matchVerseText(text, hints, { wait: false }).catch(() => []);
    const current = KEY.getState(view.state);
    if (view.isDestroyed || current?.id !== state.id) return;
    if (view.state.doc !== doc) {
      // Moved by a change that wasn't the user's: read it again where it is now.
      reading.delete(state.id);
      void read(view, current);
      return;
    }
    const chips = readPaste(text, matches).map((chip) => ({
      ...chip,
      at: { from: posAt(chip.from), to: posAt(chip.to) },
    }));
    view.dispatch(
      chips.length
        ? view.state.tr.setMeta(KEY, { ...state, chips }).setMeta('addToHistory', false)
        : clear(view.state.tr),
    );
  } catch (error) {
    // The paste stays as it was, with no prompt.
    console.error('Reading a paste failed', error);
    if (!view.isDestroyed && KEY.getState(view.state)?.id === state.id)
      view.dispatch(clear(view.state.tr));
  } finally {
    reading.delete(state.id);
  }
}

/**
 * The text between two positions, a line per text block, with a chip as one character, and the
 * position of each offset in it.
 */
export function textOf(doc: PmNode, from: number, to: number) {
  let text = '';
  const runs: Array<{ offset: number; pos: number }> = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock) {
      if (text) text += '\n';
      return true;
    }
    if (node.isText) {
      const start = Math.max(from, pos);
      const end = Math.min(to, pos + node.nodeSize);
      runs.push({ offset: text.length, pos: start });
      text += node.text!.slice(start - pos, end - pos);
    } else if (node.isInline) {
      runs.push({ offset: text.length, pos });
      text += LEAF;
    }
    return true;
  });
  const posAt = (offset: number): number => {
    let run = runs[0] ?? { offset: 0, pos: from };
    for (const r of runs) if (r.offset <= offset) run = r;
    return run.pos + (offset - run.offset);
  };
  return { text, posAt };
}

/** "Make chip": the chips replace what they stand for, as one step that Undo takes back. */
export function makePasteChips(editor: Editor, chips: readonly PlacedChip[]) {
  const state = KEY.getState(editor.state);
  if (!state?.chips) return;
  const { tr, schema } = editor.state;
  closeHistory(tr);
  for (const chip of chips.toSorted((a, b) => b.at.from - a.at.from)) {
    tr.replaceWith(chip.at.from, chip.at.to, schema.nodes.verse!.create(chip.ref));
  }
  const rest = state.chips.filter((chip) => !chips.includes(chip));
  const left = mapped({ ...state, chips: rest }, tr);
  tr.setMeta(KEY, rest.length ? left : null);
  editor.view.dispatch(tr);
  editor.view.focus();
}

/** Whether a paste is being read or offered: the verse list stays shut meanwhile. */
export const pasteOffered = (state: EditorState): boolean => !!KEY.getState(state);

export function dismissPaste(editor: Editor) {
  if (KEY.getState(editor.state)) editor.view.dispatch(clear(editor.state.tr));
}
