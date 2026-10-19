import { BOOK_CODES, type BookCode, getBook } from '@lamp/domain';
import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight } from 'lucide-react';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { ScreenTitle } from '@/components/shell/slots.tsx';
import { tagById } from '@/data/queries.ts';
import { byBook, byMonth, lastMonths, themeData } from '@/data/theme-map.ts';
import { today } from '@/lib/dates.ts';
import { count } from '@/lib/labels.ts';
import { useScreenReady } from '@/lib/screen-ready.ts';
import { monthShort, type ThemeView } from './theme-map.tsx';

const rowClass =
  '-mx-2 flex min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * A tag's row of the theme map as a list (wireframes/reflection.md): by month, the months with
 * notes, newest first ("Mar 2026 · 4 notes ›"); by book, every one of the 66, "no notes" for the
 * plain ones. Each opens its notes on the tag page.
 */
export function TagThemeScreen({ tagId, view }: { tagId: string; view: ThemeView }) {
  const tag = useLiveQuery(() => tagById(tagId), [tagId]);
  const data = useLiveQuery(() => themeData(), []);
  useScreenReady('tag-theme', tag !== undefined && data !== undefined);
  if (tag === undefined || data === undefined) return <ScreenSkeleton />;
  if (tag === null) {
    return (
      <>
        <ScreenTitle>Tag not found</ScreenTitle>
        <NotFoundScreen>This tag doesn’t exist on this device.</NotFoundScreen>
      </>
    );
  }

  const months = lastMonths(today());
  const own = data.items.filter((item) => item.tagId === tag.id);
  const row = view === 'month' ? byMonth([tag], own, months)[0] : byBook([tag], own)[0];
  const cells = row?.cells ?? [];

  return (
    <div className="flex flex-col gap-4">
      <ScreenTitle>#{tag.name}</ScreenTitle>
      <p className="text-sm text-muted-foreground">
        {view === 'month'
          ? `${count(row?.total ?? 0, 'note')} in the last ${months.length} months`
          : `${count(row?.total ?? 0, 'note')} citing a verse, by book`}
      </p>
      {view === 'month' ? (
        <ul className="flex flex-col">
          {months
            .map((month, i) => ({ month, n: cells[i] ?? 0 }))
            .filter(({ n }) => n > 0)
            .toReversed()
            .map(({ month, n }) => (
              <li key={month}>
                <Link
                  to="/tags/$tagId"
                  params={{ tagId: tag.id }}
                  search={{ month }}
                  className={rowClass}
                >
                  <span className="flex-1">
                    {monthShort(month)} · {count(n, 'note')}
                  </span>
                  <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
        </ul>
      ) : (
        (['OT', 'NT'] as const).map((testament) => (
          <section key={testament} aria-labelledby={`testament-${testament}`}>
            <h2
              id={`testament-${testament}`}
              className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
              {testament === 'OT' ? 'Old Testament' : 'New Testament'}
            </h2>
            <ul className="flex flex-col">
              {BOOK_CODES.map((book, i) => ({ book, n: cells[i] ?? 0 }))
                .filter(({ book }) => getBook(book).testament === testament)
                .map(({ book, n }) => (
                  <li key={book}>
                    <BookRow tagId={tag.id} book={book} n={n} />
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
      <Link
        to="/tags/$tagId"
        params={{ tagId: tag.id }}
        className="self-start rounded-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Every note tagged #{tag.name} ›
      </Link>
    </div>
  );
}

function BookRow({ tagId, book, n }: { tagId: string; book: BookCode; n: number }) {
  const name = getBook(book).name;
  if (n === 0) {
    return (
      <p className="flex min-h-11 items-center px-0 py-1.5 text-muted-foreground">
        {name} · no notes
      </p>
    );
  }
  return (
    <Link to="/tags/$tagId" params={{ tagId }} search={{ book }} className={rowClass}>
      <span className="flex-1">
        {name} · {count(n, 'note')}
      </span>
      <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
    </Link>
  );
}
