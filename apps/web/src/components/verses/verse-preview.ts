import type { VerseRef } from '@lamp/domain';
import { type Editor, Extension } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { useEffect } from 'react';
import { bookState, onBookArrived } from '@/data/bible.ts';
import { useSettings } from '@/data/use-settings.ts';
import { verseTextNodes } from './verse-text.tsx';

/** The user's "Show verse text in notes" setting, for every open editor. */
let enabled = false;
const editors = new Set<Editor>();
const key = new PluginKey<DecorationSet>('versePreviews');

/** Turns the previews on or off in every open editor (from `UserSettings.autoPreviewVerses`). */
export function setAutoPreview(on: boolean) {
  if (on === enabled) return;
  enabled = on;
  for (const editor of editors) redraw(editor);
}

/** Keeps the previews in step with the user's setting, while the page has notes. */
export function useAutoPreview() {
  const on = useSettings()?.autoPreviewVerses ?? true;
  useEffect(() => setAutoPreview(on), [on]);
}

function redraw(editor: Editor) {
  if (editor.isDestroyed) return;
  editor.view.dispatch(editor.state.tr.setMeta(key, true).setMeta('addToHistory', false));
}

/**
 * With the setting on, each paragraph's verse chips show their text under it, numbered, as a quote
 * that isn't part of the note (wireframes/verses.md "Verse text in notes"). It's the snapshot, as
 * the chip's viewer shows it, and is drawn again when a chip's book arrives (its numbers).
 */
export const VersePreviews = Extension.create<unknown, { stop?: () => void }>({
  name: 'versePreviews',

  addStorage() {
    return {};
  },

  onCreate() {
    const { editor } = this;
    editors.add(editor);
    this.storage.stop = onBookArrived(() => enabled && redraw(editor));
  },

  onDestroy() {
    editors.delete(this.editor);
    this.storage.stop?.();
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        state: {
          init: (_, { doc }) => previews(doc),
          apply: (tr, set) => (tr.docChanged || tr.getMeta(key) ? previews(tr.doc) : set),
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    ];
  },
});

function previews(doc: PmNode): DecorationSet {
  if (!enabled) return DecorationSet.empty;
  const widgets: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const refs: VerseRef[] = [];
    node.forEach((child) => {
      if (child.type.name === 'verse') refs.push(child.attrs as VerseRef);
    });
    if (refs.length > 0) {
      widgets.push(
        Decoration.widget(pos + node.nodeSize, () => previewDom(refs), {
          // Kept while the chips and their books are the same, so typing doesn't redraw it.
          key: refs
            .map(
              (r) =>
                `${r.display}|${r.snapshotText ?? ''}|${bookState(r.translation, r.book).status}`,
            )
            .join('\n'),
          side: -1,
          ignoreSelection: true,
        }),
      );
    }
    return false;
  });
  return DecorationSet.create(doc, widgets);
}

function previewDom(refs: VerseRef[]): HTMLElement {
  const dom = document.createElement('div');
  dom.contentEditable = 'false';
  dom.dataset.versePreview = '';
  // Set apart from the note: a tinted card, smaller italic text, so it never reads as typed.
  dom.className =
    'my-2 flex flex-col gap-3 rounded-r-lg border-l-[3px] border-primary/60 bg-muted/70 px-3 py-2.5 text-[0.9em] leading-relaxed select-none';
  for (const ref of refs) {
    const item = document.createElement('div');
    const label = document.createElement('div');
    label.className =
      'mb-0.5 font-sans text-[0.7rem] font-medium tracking-wide text-primary uppercase';
    label.textContent = `${ref.display} · ${ref.translation}`;
    const text = document.createElement('div');
    if (ref.snapshotText) {
      text.className = 'font-serif text-foreground/80 italic';
      text.append(...verseTextNodes(bookState(ref.translation, ref.book), ref, ref.snapshotText));
    } else {
      text.className = 'font-sans text-sm text-muted-foreground';
      text.textContent = 'Text not downloaded yet.';
    }
    item.append(label, text);
    dom.append(item);
  }
  return dom;
}
