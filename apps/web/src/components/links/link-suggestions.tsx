/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role, jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus */
import { cn } from 'cn';
import { useEffect, useId, useLayoutEffect, useState } from 'react';
import { LAPTOP_QUERY, type KeyHandler } from '@/components/verses/verse-suggestions.tsx';
import { shortDate } from '@/lib/dates.ts';
import { useKeyboardInset } from '@/lib/use-keyboard.ts';
import { useMediaQuery } from '@/lib/use-media-query.ts';
import type { LinkSuggestionProps } from './note-link.ts';
import { type LinkOption, optionWords } from './link-options.ts';

interface LinkSuggestionsProps extends LinkSuggestionProps {
  /** Hands the plugin the list's key handler. */
  onKeys: (handler: KeyHandler) => void;
}

/** How long the index may take before "Getting search ready…" shows (UX-PATTERNS "Loading"). */
const SLOW_MS = 300;

const keyOf = (option: LinkOption) =>
  option.kind === 'lesson' ? option.lesson.id : option.section.id;

/**
 * The `[[` picker's list (wireframes/thinking.md "Link picker"): lessons, then sections, the
 * selected one highlighted. As the verse suggestions, it's the ARIA combobox pattern: the editor
 * keeps focus and points at the selected option; ↑ and ↓ choose, Enter links, a tap links.
 */
export function LinkSuggestions({ items, query, command, editor, onKeys }: LinkSuggestionsProps) {
  const id = useId();
  const laptop = useMediaQuery(LAPTOP_QUERY);
  const keyboard = useKeyboardInset();
  const found = items[0];
  const options = found ? [...found.lessons, ...found.sections] : [];
  const listKey = options.map(keyOf).join('|');
  const [selection, setSelection] = useState({ listKey, index: 0 });
  const selected = selection.listKey === listKey ? selection.index : 0;
  const select = (index: number) => setSelection({ listKey, index });
  const slow = useSlow(!!found?.searching);

  const onKey: KeyHandler = (event) => {
    if (options.length === 0 || event.altKey || event.ctrlKey || event.metaKey) return false;
    const count = options.length;
    switch (event.key) {
      case 'ArrowDown':
        select((selected + 1) % count);
        return true;
      case 'ArrowUp':
        select((selected - 1 + count) % count);
        return true;
      case 'Enter':
        command(options[selected]!);
        return true;
      default:
        return false;
    }
  };
  useLayoutEffect(() => onKeys(onKey));

  const active = options.length > 0 ? `${id}-${selected}` : undefined;
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

  const toolbar = laptop ? null : document.querySelector('[role="toolbar"][aria-label="Editing"]');
  const bottom = toolbar ? window.innerHeight - toolbar.getBoundingClientRect().top + 4 : keyboard;

  const group = (title: string, list: LinkOption[], offset: number) =>
    list.length > 0 && (
      <li role="presentation">
        <div
          aria-hidden
          className="px-2 pt-1.5 pb-0.5 text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          {title}
        </div>
        <ul role="group" aria-label={title}>
          {list.map((option, i) => (
            <Option
              key={keyOf(option)}
              id={`${id}-${offset + i}`}
              option={option}
              selected={selected === offset + i}
              onChoose={() => command(option)}
            />
          ))}
        </ul>
      </li>
    );

  return (
    <ul
      id={id}
      role="listbox"
      aria-label="Link to a lesson or section"
      style={laptop ? undefined : { bottom }}
      className={cn(
        'flex flex-col overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10',
        laptop ? 'max-h-80 w-80' : 'fixed inset-x-2 max-h-[40vh]',
      )}
      onPointerDown={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
    >
      {found && group('Lessons', found.lessons, 0)}
      {found && group('Sections', found.sections, found.lessons.length)}
      {found && options.length === 0 && !(found.searching && slow) && (
        <li className="px-2 py-1.5 text-sm text-muted-foreground">
          Nothing matches “{query.trim()}”.
        </li>
      )}
      {found?.searching && slow && (
        <li role="status" className="px-2 py-1.5 text-sm text-muted-foreground">
          Getting search ready…
        </li>
      )}
      {options.length > 0 && (
        <li
          aria-hidden
          className="mt-1 hidden border-t px-2 pt-1.5 pb-0.5 text-xs text-muted-foreground pointer-fine:block"
        >
          ↑↓ choose · Enter link · Esc keep
        </li>
      )}
    </ul>
  );
}

/** True once `waiting` has lasted `SLOW_MS`. */
function useSlow(waiting: boolean): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [waiting]);
  return waiting && slow;
}

interface OptionProps {
  id: string;
  option: LinkOption;
  selected: boolean;
  onChoose: () => void;
}

function Option({ id, option, selected, onChoose }: OptionProps) {
  const { lesson } = option;
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      className="flex cursor-default flex-col gap-0.5 rounded-md px-2 py-1.5 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground pointer-coarse:min-h-11 pointer-coarse:justify-center"
      onClick={onChoose}
    >
      {option.kind === 'lesson' ? (
        <span className="line-clamp-2">
          {lesson.title} <span className="text-muted-foreground">· {shortDate(lesson.date)}</span>
        </span>
      ) : (
        <>
          <span className="line-clamp-2">{optionWords(option.section)}</span>
          <span className="text-xs text-muted-foreground">{lesson.title}</span>
        </>
      )}
    </li>
  );
}
