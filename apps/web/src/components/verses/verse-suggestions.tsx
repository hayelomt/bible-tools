/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role, jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus */
import type { ParsedPassage, TranslationId } from '@lamp/domain';
import { cn } from 'cn';
import { useEffect, useId, useLayoutEffect, useState } from 'react';
import { quoteText, useBook } from '@/data/bible.ts';
import { useActiveTranslation } from '@/data/translation.ts';
import { useKeyboardInset } from '@/lib/use-keyboard.ts';
import { useMediaQuery } from '@/lib/use-media-query.ts';
import type { PassageEntry, VerseSuggestionProps } from './verse-suggestion.ts';
import { VerseText } from './verse-text.tsx';

/** Above this width the list hangs under the cursor; below it, it sits above the toolbar. */
export const LAPTOP_QUERY = '(min-width: 1024px)';

/** A key pressed in the editor while the list is open; true when the list used it. */
export type KeyHandler = (event: KeyboardEvent) => boolean;

interface VerseSuggestionsProps extends VerseSuggestionProps {
  /** Hands the plugin the list's key handler. */
  onKeys: (handler: KeyHandler) => void;
}

/**
 * The verse suggestions (wireframes/verses.md "Verse autocomplete"): each passage the typed
 * reference could be, the selected one with its text, or why the reference can't exist. The
 * editor keeps focus throughout: ↑ and ↓ choose, Enter inserts, a tap inserts.
 *
 * As in `PassageInput`, it's the ARIA combobox pattern (the editor points at the selected option
 * with `aria-activedescendant`), which the lint's prefer-a-native-element rules (disabled at the
 * top) don't know; the options take no focus, so typing goes on.
 */
export function VerseSuggestions({ items, command, editor, onKeys }: VerseSuggestionsProps) {
  const id = useId();
  const laptop = useMediaQuery(LAPTOP_QUERY);
  const keyboard = useKeyboardInset();
  const passages = items.filter((item): item is PassageEntry => item.kind === 'passage');
  // The first passage is selected again whenever the list changes.
  const listKey = passages.map((p) => p.ref.display).join('|');
  const [selection, setSelection] = useState({ listKey, index: 0 });
  const selected = selection.listKey === listKey ? selection.index : 0;
  const select = (index: number) => setSelection({ listKey, index });

  const onKey: KeyHandler = (event) => {
    if (passages.length === 0 || event.altKey || event.ctrlKey || event.metaKey) return false;
    const count = passages.length;
    switch (event.key) {
      case 'ArrowDown':
        select((selected + 1) % count);
        return true;
      case 'ArrowUp':
        select((selected - 1 + count) % count);
        return true;
      case 'Enter':
        command(passages[selected]!);
        return true;
      default:
        return false;
    }
  };
  useLayoutEffect(() => onKeys(onKey));

  // Screen readers follow the selected passage while the cursor stays in the text.
  const active = passages.length > 0 ? `${id}-${selected}` : undefined;
  useEffect(() => {
    const dom = editor.view.dom;
    if (!active) return;
    dom.setAttribute('aria-activedescendant', active);
    dom.setAttribute('aria-controls', id);
    return () => {
      dom.removeAttribute('aria-activedescendant');
      dom.removeAttribute('aria-controls');
    };
  }, [editor, active, id]);

  // On a phone: just above the editing toolbar, which sits on the keyboard when it's open.
  const toolbar = laptop ? null : document.querySelector('[role="toolbar"][aria-label="Editing"]');
  const bottom = toolbar ? window.innerHeight - toolbar.getBoundingClientRect().top + 4 : keyboard;

  return (
    <ul
      id={id}
      role="listbox"
      aria-label="Verse suggestions"
      style={laptop ? undefined : { bottom }}
      className={cn(
        'flex flex-col overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10',
        laptop ? 'max-h-80 w-80' : 'fixed inset-x-2 max-h-[40vh]',
      )}
      // A tap or click chooses without taking focus from the note (or closing the keyboard).
      onPointerDown={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
    >
      {items.map((item, i) =>
        item.kind === 'error' ? (
          <li key={i} className="px-2 py-1.5 text-sm text-muted-foreground">
            {item.message}
          </li>
        ) : (
          <Option
            key={item.ref.display}
            id={`${id}-${passages.indexOf(item)}`}
            entry={item}
            selected={passages[selected] === item}
            onChoose={() => command(item)}
          />
        ),
      )}
      {passages.length > 0 && (
        <li
          aria-hidden
          className="mt-1 hidden border-t px-2 pt-1.5 pb-0.5 text-xs text-muted-foreground pointer-fine:block"
        >
          ↑↓ choose · Enter insert · Esc keep
        </li>
      )}
    </ul>
  );
}

interface OptionProps {
  id: string;
  entry: PassageEntry;
  selected: boolean;
  onChoose: () => void;
}

function Option({ id, entry, selected, onChoose }: OptionProps) {
  const translation = useActiveTranslation();
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      className="flex cursor-default flex-col gap-0.5 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground pointer-coarse:min-h-11 pointer-coarse:justify-center"
      onClick={onChoose}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span>{entry.ref.display}</span>
        {selected && <span className="text-xs text-muted-foreground">{translation}</span>}
      </div>
      {selected && <Preview passage={entry.ref} translation={translation} />}
    </li>
  );
}

/** The selected passage's text in the active translation, numbered, a few lines of it. */
function Preview({ passage, translation }: { passage: ParsedPassage; translation: TranslationId }) {
  const book = useBook(translation, passage.book);
  if (book.status === 'ready') {
    return (
      <VerseText
        passage={passage}
        translation={translation}
        text={quoteText(book.text, passage, translation)}
        className="line-clamp-3"
      />
    );
  }
  return (
    <span className="line-clamp-3 text-muted-foreground">
      {book.status === 'missing' ? 'Text not downloaded yet' : '…'}
    </span>
  );
}
