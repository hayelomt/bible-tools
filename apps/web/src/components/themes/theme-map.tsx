import { BOOK_CODES, type BookCode, getBook } from '@lamp/domain';
import { Button, buttonVariants } from '@lamp/ui/components/button';
import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { Segmented } from '@/components/segmented.tsx';
import { ScreenTitle } from '@/components/shell/slots.tsx';
import { LAPTOP_QUERY } from '@/components/verses/verse-suggestions.tsx';
import {
  byBook,
  byMonth,
  HEAT_STEPS,
  heatStep,
  lastMonths,
  type ThemeRow,
  themeData,
} from '@/data/theme-map.ts';
import { today } from '@/lib/dates.ts';
import { count } from '@/lib/labels.ts';
import { useAfter } from '@/lib/use-after.ts';
import { useMediaQuery } from '@/lib/use-media-query.ts';
import { useScreenReady } from '@/lib/screen-ready.ts';

export type ThemeView = 'month' | 'book';

export interface ThemeSearch {
  /** By book; absent means by month. */
  view?: ThemeView;
}

export const validateThemeSearch = (search: Record<string, unknown>): ThemeSearch => ({
  view: search.view === 'book' ? 'book' : undefined,
});
const VIEWS = ['month', 'book'] as const;
const VIEW_LABELS: Record<ThemeView, string> = { month: 'By month', book: 'By book' };

/** Rows shown at first, the most used tags; "Show all" lists the rest. */
const TAGS_SHOWN = 12;

/** A heat step's look; the count is always in the cell's name too (UX-PATTERNS). */
const HEAT_CLASSES = [
  'bg-transparent',
  'bg-primary/20',
  'bg-primary/45',
  'bg-primary/70',
  'bg-primary',
] as const;

const MONTH = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const LONG_MONTH = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const SHORT_MONTH = new Intl.DateTimeFormat('en-GB', { month: 'narrow', timeZone: 'UTC' });
const asDate = (month: string) => new Date(`${month}-01T00:00:00Z`);

/** "Nov 2024". */
export const monthShort = (month: string) => MONTH.format(asDate(month));
/** "November 2024". */
export const monthLong = (month: string) => LONG_MONTH.format(asDate(month));
/** "Gen", "1Sa", "Jhn": the book's code as the laptop grid heads its column. */
export const bookAbbreviation = (book: BookCode) => book[0] + book.slice(1).toLowerCase();

/**
 * The theme map (F31, wireframes/reflection.md "Theme map"): each tag against the last 24 months
 * or the 66 books, as a heat grid. On a phone a row opens the tag's months or books; on a laptop
 * each cell opens its notes.
 */
export function ThemeMapScreen({
  view,
  onView,
}: {
  view: ThemeView;
  onView: (view: ThemeView) => void;
}) {
  const day = today();
  const data = useLiveQuery(() => themeData(), []);
  const laptop = useMediaQuery(LAPTOP_QUERY);
  const slow = useAfter(300);
  const [all, setAll] = useState(false);
  useScreenReady('theme-map', data !== undefined);

  const months = lastMonths(day);
  const rows = data
    ? view === 'month'
      ? byMonth(data.tags, data.items, months)
      : byBook(data.tags, data.items)
    : undefined;
  const shown = rows && (all ? rows : rows.slice(0, TAGS_SHOWN));

  return (
    <div className="flex flex-col gap-4">
      <ScreenTitle>Theme map</ScreenTitle>
      <fieldset className="min-w-0 border-0 p-0">
        <legend className="sr-only">Show tags</legend>
        <Segmented
          name="theme-view"
          options={VIEWS}
          labels={VIEW_LABELS}
          value={view}
          onChange={onView}
        />
      </fieldset>
      {!rows || !shown ? (
        slow && <ScreenSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <Empty hasTags={data!.items.length > 0} view={view} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {view === 'month' ? `Last ${months.length} months` : 'All 66 books'} ·{' '}
            {count(rows.length, 'tag')}
          </p>
          {laptop ? (
            <Grid view={view} rows={shown} months={months} />
          ) : (
            <PhoneRows view={view} rows={shown} months={months} />
          )}
          {shown.length < rows.length && (
            <Button variant="ghost" className="self-start" onClick={() => setAll(true)}>
              Show all {rows.length} tags
            </Button>
          )}
          <Legend />
        </>
      )}
    </div>
  );
}

function Empty({ hasTags, view }: { hasTags: boolean; view: ThemeView }) {
  if (hasTags) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        {view === 'month'
          ? 'Nothing tagged in the last 24 months.'
          : 'No tagged notes cite a verse yet.'}
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <p className="text-muted-foreground">
        No tags yet. Tag sections and lessons to see what you dwell on.
      </p>
      <Link to="/" data-slot="button" className={buttonVariants({ variant: 'outline' })}>
        Go to lessons
      </Link>
    </div>
  );
}

/** One cell's look: a plain dot for none, a coloured block otherwise. */
function Cell({ n, className }: { n: number; className?: string }) {
  const step = heatStep(n);
  return step === 0 ? (
    <span aria-hidden className={cn('flex items-center justify-center', className)}>
      <span className="size-0.5 rounded-full bg-muted-foreground/60" />
    </span>
  ) : (
    <span aria-hidden className={cn('block rounded-[2px]', HEAT_CLASSES[step], className)} />
  );
}

/** The columns' names, for a cell's: "March 2026" or "Romans". */
function columnNames(view: ThemeView, months: readonly string[]): string[] {
  return view === 'month' ? months.map(monthLong) : BOOK_CODES.map((code) => getBook(code).name);
}

/**
 * A phone's rows (wireframes: "the row is the touch target"): each tag a link to its months or
 * books, with its count in its name, and the cells drawn small beside it.
 */
function PhoneRows({
  view,
  rows,
  months,
}: {
  view: ThemeView;
  rows: ThemeRow[];
  months: readonly string[];
}) {
  return (
    <div className="flex flex-col gap-1">
      {view === 'month' && (
        <div aria-hidden className="flex justify-between pr-6 pl-20 text-xs text-muted-foreground">
          <span>{monthShort(months[0]!)}</span>
          <span>{monthShort(months.at(-1)!)}</span>
        </div>
      )}
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li key={row.tag.id}>
            <Link
              to="/themes/$tagId"
              params={{ tagId: row.tag.id }}
              search={view === 'book' ? { view } : {}}
              aria-label={`${row.tag.name}: ${count(row.total, 'note')}${
                view === 'month' ? ' in the last 24 months' : ''
              }`}
              className="-mx-2 flex min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {view === 'month' ? (
                <>
                  <span className="w-18 shrink-0 truncate">{row.tag.name}</span>
                  <Strip cells={row.cells} />
                </>
              ) : (
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex justify-between gap-2">
                    <span className="truncate">{row.tag.name}</span>
                    <span className="text-sm text-muted-foreground">{row.total}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="w-6 text-xs text-muted-foreground">OT</span>
                    <Strip cells={row.cells.slice(0, 39)} />
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="w-6 text-xs text-muted-foreground">NT</span>
                    <Strip cells={row.cells.slice(39)} columns={39} />
                  </span>
                </span>
              )}
              <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A row of small cells; `columns` keeps a shorter strip at the same cell width. */
function Strip({ cells, columns = cells.length }: { cells: number[]; columns?: number }) {
  return (
    <span
      aria-hidden
      className="grid min-w-0 flex-1 gap-px"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {cells.map((n, i) => (
        <Cell key={i} n={n} className="h-4" />
      ))}
    </span>
  );
}

/**
 * A laptop's grid: tags down, months or books across, as a table to screen readers. Each cell
 * with notes opens them on the tag page, its count in its name ("grace, March 2026, 4 notes").
 */
function Grid({
  view,
  rows,
  months,
}: {
  view: ThemeView;
  rows: ThemeRow[];
  months: readonly string[];
}) {
  const names = columnNames(view, months);
  const keys = view === 'month' ? months : BOOK_CODES;
  return (
    // Relative, so the cells' screen-reader text scrolls with them instead of widening the page.
    <div className="relative overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-sm">
        <caption className="sr-only">
          {view === 'month' ? 'Tags by month' : 'Tags by book'}: notes in each
        </caption>
        <thead>
          <tr>
            <th scope="col" className="sr-only">
              Tag
            </th>
            {keys.map((key, i) => (
              <th
                key={key}
                scope="col"
                abbr={names[i]}
                className="px-0.5 text-center text-xs font-normal text-muted-foreground"
              >
                {view === 'month' ? (
                  <span title={names[i]}>
                    {SHORT_MONTH.format(asDate(key))}
                    {key.endsWith('-01') || i === 0 ? (
                      <span className="block">’{key.slice(2, 4)}</span>
                    ) : (
                      <span className="block">&nbsp;</span>
                    )}
                  </span>
                ) : (
                  <span title={names[i]}>{bookAbbreviation(key as BookCode)}</span>
                )}
              </th>
            ))}
            <th scope="col" className="px-2 text-right text-xs font-normal text-muted-foreground">
              Notes
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.tag.id}>
              <th scope="row" className="pr-3 text-left font-normal whitespace-nowrap">
                <Link
                  to="/themes/$tagId"
                  params={{ tagId: row.tag.id }}
                  search={view === 'book' ? { view } : {}}
                  className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {row.tag.name}
                </Link>
              </th>
              {row.cells.map((n, i) => {
                const label = `${row.tag.name}, ${names[i]}, ${n === 0 ? 'no notes' : count(n, 'note')}`;
                const cell = <Cell n={n} className="size-5" />;
                return (
                  <td key={keys[i]} className="p-0">
                    {n === 0 ? (
                      <span className="block" title={label}>
                        {cell}
                        <span className="sr-only">{label}</span>
                      </span>
                    ) : (
                      <Link
                        to="/tags/$tagId"
                        params={{ tagId: row.tag.id }}
                        search={
                          view === 'month' ? { month: keys[i] } : { book: keys[i] as BookCode }
                        }
                        aria-label={label}
                        title={label}
                        className="block rounded-[2px] outline-none hover:ring-2 hover:ring-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {cell}
                      </Link>
                    )}
                  </td>
                );
              })}
              <td className="px-2 text-right text-muted-foreground">{row.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** `· none ░ 1–2 ▒ 3–5 ▓ 6–9 █ 10+`, with numbers, so colour isn't the only signal. */
function Legend() {
  return (
    <ul aria-label="Scale" className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
      {HEAT_STEPS.map((step) => (
        <li key={step.label} className="flex items-center gap-1.5">
          <Cell n={step.from} className="size-3" />
          {step.label}
        </li>
      ))}
    </ul>
  );
}
