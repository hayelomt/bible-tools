/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role, jsx-a11y/click-events-have-key-events */
import { MAX_TAG_NAME_LENGTH, normaliseTagName } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import { Input } from '@lamp/ui/components/input';
import { toast } from '@lamp/ui/components/sonner';
import { cn } from 'cn';
import { useLiveQuery } from 'dexie-react-hooks';
import { PlusIcon, XIcon } from 'lucide-react';
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RowNotFoundError } from '@/data/action.ts';
import {
  addTag,
  removeTag,
  restoreTag,
  type TagLink,
  type TagTarget,
} from '@/data/actions/tags.ts';
import { allTags, tagsOf } from '@/data/queries.ts';
import { matchTags } from './match-tags.ts';
import { TagPageLink } from './tag-page-link.tsx';

interface TagInputProps {
  /** The text field's id, for its `<label>`. */
  id: string;
  /**
   * What the tags go on, shown as chips above the field. Or, with `onPick` instead, the field only
   * picks a tag by name, for several items at once (the Inbox's Tag, M11-02).
   */
  target: TagTarget | { onPick: (name: string) => void };
  /** Puts the cursor in the field when it appears (the section menu's Tags). */
  focusOnMount?: boolean;
  /** Escape with no list open: the section's tag row closes. */
  onEscape?: () => void;
}

type Option = { kind: 'tag'; id: string; name: string } | { kind: 'create'; name: string };

/** A write from the tag input; a section or lesson deleted meanwhile has nothing left to tag. */
function run(write: Promise<unknown>) {
  write.catch((error: unknown) => {
    if (error instanceof RowNotFoundError) return;
    console.error('Saving a tag failed', error);
  });
}

/** Takes a tag off at once, with Undo (UX-PATTERNS "Confirmations"). */
export function untag(link: TagLink, name: string) {
  run(
    removeTag(link).then(() =>
      toast(`#${name} removed.`, {
        duration: 10_000,
        action: { label: 'Undo', onClick: () => run(restoreTag(link)) },
      }),
    ),
  );
}

/**
 * The tag input (F4, wireframes/lessons.md "Tag input"): the item's tags as chips, and a field that
 * offers seeded and custom tags as you type. Enter adds the highlighted one, or creates the typed
 * name when it's the "Create" row; case doesn't make a new tag ("Grace" picks "grace").
 *
 * The ARIA combobox pattern, as in `PassageInput` (the rules disabled at the top don't know it).
 */
export function TagInput({ id, target, focusOnMount = false, onEscape }: TagInputProps) {
  const tags = useLiveQuery(() => allTags(), []);
  const on = 'onPick' in target ? null : target;
  const applied = useLiveQuery(async () => (on ? tagsOf(on) : []), [on?.kind, on?.id]);
  function add(name: string) {
    if (on) run(addTag(on, name));
    else if ('onPick' in target) target.onPick(name);
  }
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const noteId = useId();

  useLayoutEffect(() => {
    if (focusOnMount) input.current?.focus();
    // Only when it appears.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const appliedIds = useMemo(() => new Set(applied?.map((a) => a.tag.id)), [applied]);

  // A chip added or removed above the field moves it; keep it in sight while it's typed in.
  useLayoutEffect(() => {
    if (document.activeElement === input.current) {
      input.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [applied?.length]);
  const matches = open && tags ? matchTags(tags, text, appliedIds) : null;
  const options: Option[] = matches
    ? [
        ...matches.tags.map((t) => ({ kind: 'tag' as const, id: t.id, name: t.name })),
        ...(matches.create ? [{ kind: 'create' as const, name: matches.create }] : []),
      ]
    : [];
  const showList = options.length > 0;
  const alreadyOn = matches?.alreadyOn ?? null;

  // A field low on the screen (a phone) opens its list above it when there's more room there than
  // above the bottom bar or the keyboard.
  const list = useRef<HTMLUListElement>(null);
  const [above, setAbove] = useState(false);
  useLayoutEffect(() => {
    if (!showList || !list.current || !input.current) return;
    const field = input.current.getBoundingClientRect();
    const bar = document.querySelector('nav[aria-label="Main"]')?.getBoundingClientRect();
    const viewport = window.visualViewport?.height ?? window.innerHeight;
    const floor = bar && bar.height > 0 ? Math.min(bar.top, viewport) : viewport;
    const height = list.current.offsetHeight;
    setAbove(field.bottom + height > floor && field.top - height > floor - field.bottom);
  }, [showList, options.length]);

  function reset() {
    setText('');
    setOpen(false);
    setActive(0);
  }

  function pick(option: Option) {
    add(option.name);
    reset();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!showList) return setOpen(true);
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((i) => (i + step + options.length) % options.length);
        return;
      }
      case 'Enter': {
        event.preventDefault();
        const picked = options[Math.min(active, options.length - 1)];
        if (showList && picked) return pick(picked);
        // Typed before the tags were read: `addTag` still finds the name in any case.
        if (!tags && normaliseTagName(text)) add(text);
        // Otherwise it's already on the item, with nothing to add.
        if (!tags || alreadyOn) reset();
        return;
      }
      case 'Escape':
        if (showList || alreadyOn) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        } else if (onEscape) {
          event.preventDefault();
          event.stopPropagation();
          onEscape();
        }
        return;
      case 'Backspace': {
        const last = applied?.at(-1);
        if (!text && last) untag(last.link, last.tag.name);
        return;
      }
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {applied && applied.length > 0 && (
        <ul aria-label="Tags" className="flex flex-wrap gap-1.5">
          {applied.map(({ tag, link }) => (
            <li
              key={link.id}
              className="flex items-center gap-0.5 rounded-lg bg-secondary py-0.5 pl-2.5 text-sm break-all text-secondary-foreground"
            >
              <TagPageLink tag={tag} />
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove #${tag.name}`}
                onClick={() => {
                  untag(link, tag.name);
                  // The button goes with its chip; the cursor waits in the field instead.
                  input.current?.focus();
                }}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Input
          ref={input}
          id={id}
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          aria-describedby={alreadyOn ? noteId : undefined}
          placeholder="Add a tag"
          // Scrolled to on focus clear of the bottom bar, as the notes are.
          className="scroll-mb-20 lg:scroll-mb-4"
          maxLength={MAX_TAG_NAME_LENGTH + 1}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(event.target.value.trim() !== '');
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          // Leaving the field never creates a tag: only Enter or a tap on "Create" does.
          onBlur={() => setOpen(false)}
        />
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label="Tag suggestions"
          className={cn(
            'absolute inset-x-0 z-20 max-h-64 flex-col overflow-y-auto rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10',
            showList ? 'flex' : 'hidden',
            above ? 'bottom-full mb-1' : 'top-full mt-1',
          )}
        >
          {options.map((option, i) => (
            <li
              key={option.kind === 'tag' ? option.id : 'create'}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // Keeps focus in the field, so its blur doesn't close the list first.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(option)}
              className="flex cursor-default items-center gap-1.5 rounded-md px-2 py-1.5 break-all aria-selected:bg-accent aria-selected:text-accent-foreground pointer-coarse:min-h-11"
            >
              {option.kind === 'tag' ? (
                option.name
              ) : (
                <>
                  <PlusIcon aria-hidden className="size-4 shrink-0" />
                  Create “{option.name}”
                </>
              )}
            </li>
          ))}
        </ul>
        {alreadyOn && !showList && (
          <p id={noteId} className="mt-1 text-sm text-muted-foreground">
            Already tagged #{alreadyOn.name}.
          </p>
        )}
      </div>
    </div>
  );
}
