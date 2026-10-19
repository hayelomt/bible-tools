import type { VerseRef } from '@lamp/domain';
import { type Editor, Extension } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { useEffect } from 'react';
import { onBookArrived } from '@/data/bible.ts';
import { activeTranslation, onActiveTranslation } from '@/data/translation.ts';
import { useSettings } from '@/data/use-settings.ts';
import { type Reading, readRef } from '@/data/verse-text.ts';
import { missingText } from './verse-chip.ts';
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
 * that isn't part of the note (wireframes/verses.md "Verse text in notes"). It's the text the
 * chip's viewer shows, in the translation picked in Settings (decision 97), and is drawn again
 * when that changes or a chip's book arrives.
 */
export const VersePreviews = Extension.create<unknown, { stop?: () => void }>({
  name: 'versePreviews',

  addStorage() {
    return {};
  },

  onCreate() {
    const { editor } = this;
    editors.add(editor);
    const stopBooks = onBookArrived(() => enabled && redraw(editor));
    let first = true;
    const stopTranslation = onActiveTranslation(() => {
      // Called at once with the translation the plugin starts from.
      if (!first && enabled) redraw(editor);
      first = false;
    });
    this.storage.stop = () => {
      stopBooks();
      stopTranslation();
    };
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
  const active = activeTranslation();
  const widgets: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const refs: VerseRef[] = [];
    node.forEach((child) => {
      if (child.type.name === 'verse') refs.push(child.attrs as VerseRef);
    });
    if (refs.length > 0) {
      const readings = refs.map((ref) => ({ ref, ...readRef(ref, active) }));
      widgets.push(
        Decoration.widget(pos + node.nodeSize, () => previewDom(readings), {
          // Kept while the chips, their translation and books are the same, so typing doesn't
          // redraw it.
          key: readings
            .map(
              (r) => `${r.ref.display}|${r.translation}|${r.text ?? ''}|${r.book?.status ?? '-'}`,
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

function previewDom(readings: (Reading & { ref: VerseRef })[]): HTMLElement {
  const dom = document.createElement('div');
  dom.contentEditable = 'false';
  dom.dataset.versePreview = '';
  // Set apart from the note: a tinted card, smaller italic text, so it never reads as typed.
  dom.className =
    'my-2 flex flex-col gap-3 rounded-r-lg border-l-[3px] border-primary/60 bg-muted/70 px-3 py-2.5 text-[0.9em] leading-relaxed select-none';
  for (const { ref, translation, text: quote, book } of readings) {
    const item = document.createElement('div');
    const label = document.createElement('div');
    label.className =
      'mb-0.5 font-sans text-[0.7rem] font-medium tracking-wide text-primary uppercase';
    label.textContent = `${ref.display} · ${ref.versionLabel ?? translation}`;
    const text = document.createElement('div');
    if (quote) {
      text.className = 'text-foreground/80 italic';
      text.append(...verseTextNodes(book, ref, quote));
    } else {
      text.className = 'font-sans text-sm text-muted-foreground';
      text.textContent = missingText(ref);
    }
    item.append(label, text);
    dom.append(item);
  }
  return dom;
}
