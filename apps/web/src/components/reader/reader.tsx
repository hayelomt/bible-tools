import { DEFAULT_TRANSLATION, TRANSLATION_NAMES } from '@lamp/domain';
import { buttonVariants } from '@lamp/ui/components/button';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  type Chapter,
  chapterName,
  chapterSlug,
  nextChapter,
  previousChapter,
} from '@/lib/chapters.ts';
import { isTyping } from '@/lib/is-typing.ts';
import { ScreenActions, ScreenTitle } from '../shell/slots.tsx';
import { ChapterText } from './chapter-text.tsx';
import { PassagePicker } from './passage-picker.tsx';

/**
 * One chapter in the reader (wireframes/reader.md "Chapter view"): its name opens the book and
 * chapter picker, and `‹` `›` in the header, the links under the text, a swipe (phone) and `←` `→`
 * (laptop) go to the chapter before and after, across books.
 */
export function Reader({ at }: { at: Chapter }) {
  const [picking, setPicking] = useState(false);
  const previous = previousChapter(at);
  const next = nextChapter(at);
  useChapterKeys(previous, next);
  const swipe = useSwipe(previous, next);

  return (
    <>
      <ScreenTitle>
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setPicking(true)}
          className="-mx-2 inline-flex max-w-full items-center gap-1 rounded-md px-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
        >
          <span className="truncate">{chapterName(at)}</span>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </ScreenTitle>
      <ScreenActions>
        <abbr
          title={TRANSLATION_NAMES[DEFAULT_TRANSLATION]}
          className="px-1 text-xs font-medium text-muted-foreground no-underline"
        >
          {DEFAULT_TRANSLATION}
        </abbr>
        <ChapterArrow to={previous} direction="previous" />
        <ChapterArrow to={next} direction="next" />
      </ScreenActions>

      <div {...swipe} className="flex flex-col gap-10">
        <ChapterText at={at} />
        <nav aria-label="Chapters" className="flex justify-between gap-4">
          {previous ? <ChapterLink to={previous} direction="previous" /> : <span />}
          {next && <ChapterLink to={next} direction="next" />}
        </nav>
      </div>

      <PassagePicker open={picking} onOpenChange={setPicking} current={at} />
    </>
  );
}

type Direction = 'previous' | 'next';

/** `‹` or `›` in the header; disabled at Genesis 1 and Revelation 22. */
function ChapterArrow({ to, direction }: { to: Chapter | null; direction: Direction }) {
  const Icon = direction === 'previous' ? ChevronLeft : ChevronRight;
  const label = direction === 'previous' ? 'Previous chapter' : 'Next chapter';
  const className = buttonVariants({ variant: 'ghost', size: 'icon' });
  if (!to) {
    return (
      <button type="button" disabled aria-label={label} data-slot="button" className={className}>
        <Icon />
      </button>
    );
  }
  return (
    <Link
      to="/read/$chapter"
      params={{ chapter: chapterSlug(to) }}
      aria-label={`${label}: ${chapterName(to)}`}
      data-slot="button"
      className={className}
    >
      <Icon />
    </Link>
  );
}

/** "‹ John 9" and "John 11 ›" under the chapter. */
function ChapterLink({ to, direction }: { to: Chapter; direction: Direction }) {
  return (
    <Link
      to="/read/$chapter"
      params={{ chapter: chapterSlug(to) }}
      data-slot="button"
      className={buttonVariants({ variant: 'outline' })}
    >
      {direction === 'previous' && <ChevronLeft aria-hidden />}
      {chapterName(to)}
      {direction === 'next' && <ChevronRight aria-hidden />}
    </Link>
  );
}

/** `←` and `→` for the chapter before and after (UX-PATTERNS "Shortcuts"), not while typing. */
function useChapterKeys(previous: Chapter | null, next: Chapter | null) {
  const navigate = useNavigate();
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.shiftKey || isTyping(event.target)) return;
      // The picker, or another layer, is open over the reader.
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const to = event.key === 'ArrowLeft' ? previous : event.key === 'ArrowRight' ? next : null;
      if (!to) return;
      event.preventDefault();
      void navigate({ to: '/read/$chapter', params: { chapter: chapterSlug(to) } });
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navigate, previous, next]);
}

/** A swipe this far sideways, and mostly sideways, turns the page. */
const SWIPE_PX = 60;
const SWIPE_MS = 800;

/** Swiping left for the next chapter and right for the one before (phone). */
function useSwipe(previous: Chapter | null, next: Chapter | null) {
  const navigate = useNavigate();
  const start = useRef<{ x: number; y: number; at: number } | null>(null);
  return {
    onTouchStart(event: React.TouchEvent) {
      const touch = event.touches[0];
      start.current =
        event.touches.length === 1 && touch
          ? { x: touch.clientX, y: touch.clientY, at: event.timeStamp }
          : null;
    },
    onTouchEnd(event: React.TouchEvent) {
      const from = start.current;
      const touch = event.changedTouches[0];
      start.current = null;
      if (!from || !touch || event.timeStamp - from.at > SWIPE_MS) return;
      const dx = touch.clientX - from.x;
      const dy = touch.clientY - from.y;
      if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < 2 * Math.abs(dy)) return;
      // Selecting text with a drag isn't turning the page.
      if (!document.getSelection()?.isCollapsed) return;
      const to = dx < 0 ? next : previous;
      if (to) void navigate({ to: '/read/$chapter', params: { chapter: chapterSlug(to) } });
    },
  };
}
