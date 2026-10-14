/* oxlint-disable jsx-a11y/prefer-tag-over-role -- a verse is a span with a button's role, so verses run on (Verses) */
import type { BookText } from '@lamp/bible-data';
import { formatPassage, getBook, type Highlight } from '@lamp/domain';
import { cn } from 'cn';
import { Fragment, useEffect, useRef, type RefObject } from 'react';
import { useBook } from '@/data/bible.ts';
import type { Chapter } from '@/lib/chapters.ts';
import { highlightForVerse, selectionPassage, type VerseSelection } from '@/lib/highlights.ts';
import { readingPosition, rememberPosition } from '@/lib/reading-position.ts';
import { useAfter } from '@/lib/use-after.ts';
import { useOnline } from '@/lib/use-online.ts';
import { NUMBER_CLASS } from '../verses/verse-text.tsx';
import { HIGHLIGHT_COLOUR_CLASS, HIGHLIGHT_COLOUR_NAME } from './colours.ts';
import { HighlightNote } from './highlight-note.tsx';

/**
 * The chapter's verses in the reading face, once its book is on the device; skeleton lines while
 * it's fetched, and a line saying it isn't here when it can't be (wireframes/states.md).
 */
export function ChapterText({
  at,
  highlights,
  selection,
  exact,
  noting,
  onSelect,
  onCloseNote,
  onSaveNote,
  flushRef,
}: {
  at: Chapter;
  highlights: readonly Highlight[];
  selection: VerseSelection | null;
  /** The highlight of exactly the selected verses, when there is one. */
  exact: Highlight | null;
  noting: boolean;
  onSelect: (verse: number) => void;
  onCloseNote: () => void;
  onSaveNote: (text: string) => Promise<void>;
  flushRef: RefObject<(() => Promise<void>) | null>;
}) {
  const book = useBook(at.book);
  const online = useOnline();
  const slow = useAfter(300);
  const name = getBook(at.book).name;

  if (book.status === 'ready') {
    return (
      <Verses
        text={book.text}
        at={at}
        highlights={highlights}
        selection={selection}
        exact={exact}
        noting={noting}
        onSelect={onSelect}
        onCloseNote={onCloseNote}
        onSaveNote={onSaveNote}
        flushRef={flushRef}
      />
    );
  }
  if (book.status === 'missing') {
    return (
      <p className="py-8 text-center text-muted-foreground">
        {online ? (
          <>{name} couldn’t be loaded. Try again in a moment.</>
        ) : (
          <>
            {name} hasn’t downloaded yet.
            <br />
            It will be here once you’re online.
          </>
        )}
      </p>
    );
  }
  return (
    <output aria-label={`Loading ${name}`} className="flex min-h-[50svh] flex-col gap-3">
      {slow &&
        ['w-full', 'w-11/12', 'w-full', 'w-3/4'].map((width, i) => (
          <span key={i} className={`h-4 animate-pulse rounded bg-muted ${width}`} />
        ))}
    </output>
  );
}

/** A run of verses, after a title outside the numbering (a Psalm's) or none. */
interface Block {
  title?: string;
  verses: { number: number; text: string; note?: string }[];
}

function blocks(text: BookText, chapter: number): Block[] {
  const result: Block[] = [];
  (text.c[chapter - 1] ?? []).forEach((verse, i) => {
    const key = `${chapter}:${i + 1}`;
    const title = text.d?.[key];
    if (title !== undefined || result.length === 0) result.push({ title, verses: [] });
    result.at(-1)!.verses.push({ number: i + 1, text: verse, note: text.n?.[key] });
  });
  return result;
}

/**
 * A block's verses as paragraphs, split after the last selected verse while its note is open, so
 * the note sits under those verses rather than at the end of the chapter.
 */
function runs(block: Block, noting: VerseSelection | null): (Block['verses'] | 'note')[] {
  const at = noting ? block.verses.findIndex((v) => v.number === noting.end) : -1;
  if (at === -1) return [block.verses];
  const after = block.verses.slice(at + 1);
  return [block.verses.slice(0, at + 1), 'note', ...(after.length > 0 ? [after] : [])];
}

function Verses({
  text,
  at,
  highlights,
  selection,
  exact,
  noting,
  onSelect,
  onCloseNote,
  onSaveNote,
  flushRef,
}: {
  text: BookText;
  at: Chapter;
  highlights: readonly Highlight[];
  selection: VerseSelection | null;
  exact: Highlight | null;
  noting: boolean;
  onSelect: (verse: number) => void;
  onCloseNote: () => void;
  onSaveNote: (text: string) => Promise<void>;
  flushRef: RefObject<(() => Promise<void>) | null>;
}) {
  const ref = useReadingPosition(at);
  const label = selection ? formatPassage(selectionPassage(at, selection)) : '';
  return (
    <div
      ref={ref}
      data-slot="chapter"
      className="flex flex-col gap-4 font-serif text-[17px] leading-[1.6] select-none"
    >
      {blocks(text, at.chapter).map((block, i) => (
        <div key={i} className="flex flex-col gap-2">
          {block.title && (
            <p className="text-[0.9em] text-muted-foreground italic">{block.title}</p>
          )}
          {runs(block, noting ? selection : null).map((run, k) =>
            run === 'note' ? (
              <HighlightNote
                key={`note-${selection?.start}-${selection?.end}`}
                label={label}
                initial={exact?.note ?? ''}
                onSave={onSaveNote}
                onClose={onCloseNote}
                flushRef={flushRef}
              />
            ) : (
              <p key={k}>
                {run.map((v, j) => {
                  const covering = highlightForVerse(highlights, at, v.number);
                  const selected =
                    selection !== null && v.number >= selection.start && v.number <= selection.end;
                  return (
                    <Fragment key={v.number}>
                      {/* Outside the verse, so the verse starts where its number is. */}
                      {j > 0 && ' '}
                      {/* A span, not a button: a button is drawn as a block of its own, and the
                          verses would stop running on as one paragraph. */}
                      <span
                        role="button"
                        tabIndex={0}
                        data-verse={v.number}
                        aria-pressed={selected}
                        onClick={() => onSelect(v.number)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          onSelect(v.number);
                        }}
                        className={cn(
                          'cursor-pointer rounded-sm box-decoration-clone outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                          covering && HIGHLIGHT_COLOUR_CLASS[covering.colour],
                          selected &&
                            'underline decoration-foreground decoration-2 underline-offset-4',
                        )}
                      >
                        <sup aria-hidden className={NUMBER_CLASS}>
                          {v.number}
                        </sup>
                        {/* WEB leaves four verses empty; the footnote says why (TECH-DESIGN §9). */}
                        {v.text || <span className="text-muted-foreground italic">[{v.note}]</span>}
                        {covering && (
                          <span className="sr-only">
                            {' '}
                            Highlighted {HIGHLIGHT_COLOUR_NAME[covering.colour].toLowerCase()}.
                          </span>
                        )}
                        {covering?.note && covering.ref.verseStart === v.number && (
                          <span className="sr-only"> Note: {covering.note}</span>
                        )}
                      </span>
                    </Fragment>
                  );
                })}
              </p>
            ),
          )}
        </div>
      ))}
      {/* The selection bar covers the last lines; this lets them scroll clear of it. */}
      {selection && <div className="h-28" />}
    </div>
  );
}

/**
 * The reader reopens where it was left (M5-01): the chapter, and the verse at the top of the screen,
 * remembered as the page scrolls. A chapter opens at the verse kept for it, or at the top.
 */
function useReadingPosition(at: Chapter) {
  const ref = useRef<HTMLDivElement>(null);
  const { book, chapter } = at;
  useEffect(() => {
    const kept = readingPosition();
    const target = kept.book === book && kept.chapter === chapter ? kept.verse : 1;
    const remember = (v: number) => rememberPosition({ book, chapter, verse: v });
    remember(target);
    const el = ref.current?.querySelector(`[data-verse="${target}"]`);
    // Once the reading face has loaded, which changes the lines' height, and after the router's
    // own scroll to the top of a new screen.
    let frame = 0;
    let cancelled = false;
    if (el && target > 1) {
      void document.fonts.ready.then(() => {
        if (cancelled) return;
        frame = requestAnimationFrame(() => {
          const y = el.getBoundingClientRect().top + window.scrollY - readingTop() - 8;
          window.scrollTo({ top: y });
        });
      });
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    function onScroll() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const top = topVerse(ref.current);
        if (top) remember(top);
      }, 200);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
    };
  }, [book, chapter]);
  return ref;
}

/** Where text stops being hidden: under the phone's sticky top bar, or the top of the window. */
function readingTop(): number {
  const header = document.querySelector<HTMLElement>('[data-slot="screen-header"]');
  return header && getComputedStyle(header).position === 'sticky' ? header.offsetHeight : 0;
}

/**
 * The first verse that starts in view. Verses run on in one paragraph, so the one before ends on
 * the line this one starts; counting by where verses start keeps a restored place from creeping
 * back a verse on every reload.
 */
function topVerse(container: HTMLElement | null): number | undefined {
  if (!container) return undefined;
  const top = readingTop() - 4;
  for (const el of container.querySelectorAll<HTMLElement>('[data-verse]')) {
    if (el.getBoundingClientRect().top >= top) return Number(el.dataset.verse);
  }
  return undefined;
}
