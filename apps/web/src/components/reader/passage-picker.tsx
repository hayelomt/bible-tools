import { type Book, chapterCount, getBook } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import { Dialog, DialogContent, DialogTitle } from '@lamp/ui/components/dialog';
import { Input } from '@lamp/ui/components/input';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Check } from 'lucide-react';
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { type Chapter, chapterSlug, matchBooks } from '@/lib/chapters.ts';

interface PassagePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The chapter being read, marked in the lists. */
  current: Chapter;
}

/**
 * The book and chapter picker (wireframes/reader.md "Book and chapter picker"): the books by
 * testament, narrowed by a filter, then the chosen book's chapters. A book of one chapter opens
 * straight away. Full screen on a phone, a dialog on a laptop.
 */
export function PassagePicker({ open, onOpenChange, current }: PassagePickerProps) {
  const filter = useRef<HTMLInputElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // The filter on a laptop; on a touch screen the keyboard would cover the books.
        initialFocus={(type) => (type === 'touch' ? title.current : filter.current) ?? true}
        className="top-0 left-0 h-dvh max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-3 rounded-none p-0 pt-[env(safe-area-inset-top)] sm:max-w-none lg:top-1/2 lg:left-1/2 lg:h-[min(40rem,85svh)] lg:max-w-lg lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-xl lg:pt-0"
      >
        {/* Mounted only while open, so each opening starts at the books. */}
        {open && (
          <Picker
            current={current}
            onDone={() => onOpenChange(false)}
            filterRef={filter}
            titleRef={title}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Picker({
  current,
  onDone,
  filterRef,
  titleRef,
}: {
  current: Chapter;
  onDone: () => void;
  filterRef: React.RefObject<HTMLInputElement | null>;
  titleRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');
  const [book, setBook] = useState<Book | null>(null);
  const books = matchBooks(filter);

  /**
   * Between the books and a book's chapters, focus goes to the heading of what replaced them, at
   * once: before the dialog sees the focused element go and moves focus to itself.
   */
  function show(next: Book | null) {
    flushSync(() => setBook(next));
    titleRef.current?.focus();
  }

  function choose(chosen: Book) {
    if (chapterCount(chosen.code) > 1) return show(chosen);
    onDone();
    void navigate({
      to: '/read/$chapter',
      params: { chapter: chapterSlug({ book: chosen.code, chapter: 1 }) },
    });
  }

  if (book) {
    return (
      <>
        <div className="flex items-center gap-2 px-4 pt-3 pr-12">
          <Button variant="ghost" size="icon" aria-label="All books" onClick={() => show(null)}>
            <ArrowLeft />
          </Button>
          <DialogTitle ref={titleRef} tabIndex={-1} className="text-lg outline-none">
            {book.name}
          </DialogTitle>
        </div>
        <ul
          aria-label="Chapters"
          className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] content-start gap-2 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          {Array.from({ length: chapterCount(book.code) }, (_, i) => i + 1).map((chapter) => {
            const here = book.code === current.book && chapter === current.chapter;
            return (
              <li key={chapter}>
                <Link
                  to="/read/$chapter"
                  params={{ chapter: chapterSlug({ book: book.code, chapter }) }}
                  aria-current={here ? 'true' : undefined}
                  onClick={onDone}
                  className="flex size-11 items-center justify-center rounded-lg border text-sm tabular-nums outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current]:border-primary aria-[current]:bg-primary aria-[current]:text-primary-foreground"
                >
                  {chapter}
                </Link>
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 px-4 pt-3">
        <DialogTitle
          ref={titleRef}
          tabIndex={-1}
          className="flex h-8 items-center pr-10 text-lg outline-none"
        >
          Choose a passage
        </DialogTitle>
        <Input
          ref={filterRef}
          type="search"
          aria-label="Filter books"
          placeholder="Filter books"
          autoComplete="off"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && books[0]) {
              event.preventDefault();
              choose(books[0]);
            }
          }}
        />
      </div>
      <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {books.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">No book matches “{filter}”.</p>
        )}
        {(['OT', 'NT'] as const).map((testament) => {
          const shown = books.filter((b) => b.testament === testament);
          if (shown.length === 0) return null;
          const heading = testament === 'OT' ? 'Old Testament' : 'New Testament';
          return (
            <section key={testament} aria-label={heading} className="flex flex-col gap-1">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {heading}
              </h3>
              <ul className="grid grid-cols-2 gap-x-2 sm:grid-cols-3">
                {shown.map((b) => {
                  const here = b.code === current.book;
                  return (
                    <li key={b.code}>
                      <button
                        type="button"
                        aria-current={here ? 'true' : undefined}
                        onClick={() => choose(getBook(b.code))}
                        className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current]:font-medium pointer-coarse:min-h-11"
                      >
                        <span className="truncate">{b.name}</span>
                        {here && <Check aria-hidden className="size-4 shrink-0" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
