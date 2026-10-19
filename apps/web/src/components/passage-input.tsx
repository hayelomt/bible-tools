/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role, jsx-a11y/click-events-have-key-events */
import {
  describeParseError,
  type ParsedPassage,
  parseReference,
  suggest,
  type VerseRef,
} from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import { Input } from '@lamp/ui/components/input';
import { cn } from 'cn';
import { XIcon } from 'lucide-react';
import { useId, useState } from 'react';

/** `lessonSchema` allows 20 main passages. */
const MAX_PASSAGES = 20;

interface PassageInputProps {
  /** The text field's id, for its `<label>`. */
  id: string;
  value: VerseRef[];
  onChange: (next: VerseRef[]) => void;
}

/**
 * The reference input (wireframes/lessons.md "Details"): the passages as chips, and a field that
 * completes what's typed with the same parser as the verse chips. Enter adds the highlighted
 * completion; a reference that can't be read says why under the field and keeps the text.
 *
 * It's the ARIA combobox pattern (an input owning a listbox through `aria-activedescendant`), which
 * the lint's prefer-a-native-element rules (disabled at the top) don't know: `<datalist>` can't be
 * styled, and the keyboard is handled on the input.
 */
export function PassageInput({ id, value, onChange }: PassageInputProps) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const listId = useId();
  const errorId = useId();

  const suggestions = open && text.trim() ? suggest(text) : [];
  const showList = suggestions.length > 0;
  const full = value.length >= MAX_PASSAGES;

  function add(passage: ParsedPassage) {
    const ref: VerseRef = { ...passage };
    if (!value.some((v) => v.display === ref.display)) onChange([...value, ref]);
    setText('');
    setOpen(false);
    setActive(0);
    setError(null);
  }

  /** Enter adds the highlighted completion, or else the text read as a whole reference. */
  function commit() {
    const picked = showList ? suggestions[Math.min(active, suggestions.length - 1)] : undefined;
    if (picked) return add(picked.ref);
    if (!text.trim()) return;
    const parsed = parseReference(text);
    if (parsed.ok) add(parsed.ref);
    else setError(describeParseError(parsed.error));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!showList) return setOpen(true);
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((i) => (i + step + suggestions.length) % suggestions.length);
        return;
      }
      case 'Enter':
        event.preventDefault();
        return commit();
      case 'Escape':
        if (showList) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        }
        return;
      case 'Backspace':
        if (!text && value.length > 0) onChange(value.slice(0, -1));
        return;
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul aria-label="Main passages" className="flex flex-wrap gap-1.5">
          {value.map((ref) => (
            <li
              key={ref.display}
              className="flex items-center gap-0.5 rounded-lg bg-secondary py-0.5 pl-2.5 text-sm text-secondary-foreground"
            >
              {ref.display}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${ref.display}`}
                onClick={() => onChange(value.filter((v) => v !== ref))}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Input
          id={id}
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          placeholder={full ? 'Up to 20 passages' : 'Add a passage, e.g. John 10'}
          disabled={full}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
            setActive(0);
            setError(null);
          }}
          onKeyDown={onKeyDown}
          // Leaving the field keeps a complete reference rather than dropping it; a partial one
          // ("Jo") stays as typed, since guessing a completion would surprise.
          onBlur={() => {
            setOpen(false);
            const parsed = parseReference(text);
            if (parsed.ok) add(parsed.ref);
          }}
        />
        <ul
          id={listId}
          role="listbox"
          aria-label="Passages"
          className={cn(
            'absolute inset-x-0 top-full z-20 mt-1 flex-col rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10',
            showList ? 'flex' : 'hidden',
          )}
        >
          {suggestions.map(({ ref }, i) => (
            <li
              key={ref.display}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // Keeps focus in the field, so its blur doesn't add the text first.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => add(ref)}
              className="flex cursor-default flex-col rounded-md px-2 py-1.5 aria-selected:bg-accent aria-selected:text-accent-foreground pointer-coarse:min-h-11 pointer-coarse:justify-center"
            >
              {ref.display}
            </li>
          ))}
        </ul>
      </div>
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
