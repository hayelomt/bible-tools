import { Button } from '@lamp/ui/components/button';
import { Input } from '@lamp/ui/components/input';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clearMatches, type FindMatch, findOnScreen, paintMatches, showMatch } from '@/lib/find.ts';

const LAYER = '[role="dialog"], [role="alertdialog"], [role="menu"]';

/**
 * Quick find (wireframes/reader.md "Quick find"): a word in what's on the screen, in the text under
 * `data-find-root`. The icon or Ctrl/Cmd+F opens the bar; Enter and Shift+Enter step through the
 * matches, and Escape closes it and gives focus back. The matches follow a note as it's typed; a
 * new chapter is a new screen, so the bar closes with the old one.
 */
export function QuickFind({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<FindMatch[]>([]);
  const [index, setIndex] = useState(0);
  const bar = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  const start = useCallback(() => {
    if (!bar.current?.contains(document.activeElement)) {
      returnTo.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    setOpen(true);
    input.current?.select();
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setMatches([]);
    if (returnTo.current?.isConnected) returnTo.current.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || document.querySelector(LAYER)) return;
      const find = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
      if (find && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        start();
      } else if (open && event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, start, close]);

  // The text changed: the matches follow, and the page stays where it is.
  useEffect(() => {
    if (!open || !query) return;
    let frame = 0;
    const scan = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const found = findOnScreen(query);
        setMatches(found);
        setIndex((at) => Math.max(0, Math.min(at, found.length - 1)));
      });
    };
    const observer = new MutationObserver((records) => {
      if (records.some((record) => !bar.current?.contains(record.target))) scan();
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    const onInput = (event: Event) => {
      if (!bar.current?.contains(event.target as Node)) scan();
    };
    document.addEventListener('input', onInput);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('input', onInput);
    };
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    paintMatches(matches, index);
    return clearMatches;
  }, [open, matches, index]);

  /** A new word starts from the first match. */
  function search(word: string) {
    const found = findOnScreen(word);
    setQuery(word);
    setMatches(found);
    setIndex(0);
    if (found[0]) showMatch(found[0]);
  }

  function step(by: 1 | -1) {
    if (matches.length === 0) return;
    const to = (index + by + matches.length) % matches.length;
    setIndex(to);
    showMatch(matches[to]!);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={label}
        title={`${label} (Ctrl+F)`}
        onClick={start}
        className="pointer-coarse:size-touch"
      >
        <Search />
      </Button>
      {open &&
        createPortal(
          <search
            ref={bar}
            aria-label={label}
            data-slot="quick-find"
            className="fixed inset-x-0 top-0 z-20 flex h-14 items-center gap-1 border-b bg-background px-2 lg:inset-x-auto lg:top-4 lg:right-6 lg:w-96 lg:rounded-xl lg:border lg:shadow-md print:hidden"
          >
            <Input
              ref={input}
              // Opened to type in: this is the bar's whole purpose.
              // oxlint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              type="search"
              aria-label="Find"
              placeholder="Find"
              enterKeyHint="search"
              autoComplete="off"
              value={query}
              onChange={(event) => search(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                event.preventDefault();
                step(event.shiftKey ? -1 : 1);
              }}
              className="min-w-0 flex-1 [&::-webkit-search-cancel-button]:hidden"
            />
            <output className="shrink-0 px-1 text-sm whitespace-nowrap text-muted-foreground">
              {query && (matches.length > 0 ? `${index + 1} of ${matches.length}` : 'No matches')}
            </output>
            {/* A press keeps focus in the box, so a phone's keyboard stays up between matches. */}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous match"
              disabled={matches.length === 0}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => step(-1)}
              className="pointer-coarse:size-touch"
            >
              <ChevronUp />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next match"
              disabled={matches.length === 0}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => step(1)}
              className="pointer-coarse:size-touch"
            >
              <ChevronDown />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close find"
              onClick={close}
              className="pointer-coarse:size-touch"
            >
              <X />
            </Button>
          </search>,
          document.body,
        )}
    </>
  );
}
