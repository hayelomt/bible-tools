import {
  type CompileEntry,
  type CompileGroup,
  compileScopes,
  formatPassage,
  isAppTranslation,
  isWholeBook,
  type Passage,
  parsePassageSlug,
  passageRange,
  passageSlug,
} from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@lamp/ui/components/dropdown-menu';
import { Link, useNavigate } from '@tanstack/react-router';
import { cn } from 'cn';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowUp, ChevronRight, Ellipsis } from 'lucide-react';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { ExportDialog } from '@/components/export-dialog.tsx';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { Segmented } from '@/components/segmented.tsx';
import { ScreenActions, ScreenTitle, SidePanel } from '@/components/shell/slots.tsx';
import { ReadLink } from '@/components/verses/passage-links.tsx';
import { VerseText } from '@/components/verses/verse-text.tsx';
import { VerseViewer } from '@/components/verses/verse-viewer.tsx';
import { LAPTOP_QUERY } from '@/components/verses/verse-suggestions.tsx';
import { snapshotText, useBook } from '@/data/bible.ts';
import { useActiveTranslation } from '@/data/translation.ts';
import { db as appDb } from '@/data/db.ts';
import { exportCommentary } from '@/export/load.ts';
import { shortDateWithYear } from '@/lib/dates.ts';
import { count } from '@/lib/labels.ts';
import { useAfter } from '@/lib/use-after.ts';
import { useMediaQuery } from '@/lib/use-media-query.ts';
import { useScreenReady } from '@/lib/screen-ready.ts';
import { type Commentary, type CompiledNote, commentary, scopeTitle } from '@/search/compile.ts';
import { ReadOnlyBody } from './read-only-body.tsx';

export interface CommentarySearch {
  /** The scope widened from the passage opened: its chapter or its book. */
  scope?: 'chapter' | 'book';
}

type ScopeKind = 'passage' | 'chapter' | 'book';
const SCOPE_KINDS = ['passage', 'chapter', 'book'] as const;
/** Groups read for the first screen, before the rest; about `FIRST_ROWS` rows. */
const FIRST_GROUPS = 6;

/**
 * The compile view (F22, wireframes/thinking.md "Commentary"): every section citing a passage, as
 * one read-only document grouped under the verses they cite, in canonical order. The scope is the
 * passage opened, its chapter or its book.
 */
export function CommentaryScreen({
  slug,
  search,
  onSearch,
}: {
  slug: string;
  search: CommentarySearch;
  onSearch: (next: CommentarySearch) => void;
}) {
  const opened = parsePassageSlug(slug);
  const scopes = opened ? compileScopes(opened) : null;
  // The passage, its chapter and its book, leaving out the narrower of two that are the same.
  const kinds = scopes
    ? SCOPE_KINDS.filter(
        (kind, i) =>
          !SCOPE_KINDS.slice(i + 1).some(
            (wider) => passageSlug(scopes[wider]) === passageSlug(scopes[kind]),
          ),
      )
    : [];
  const kind: ScopeKind =
    search.scope && kinds.includes(search.scope) ? search.scope : (kinds[0] ?? 'passage');
  const scope = scopes?.[kind] ?? null;
  // When the first read starts, for the first screen's time (`compile.spec.ts`).
  const readFrom = useRef<number | null>(null);
  // The first screen's groups, then the rest: a book doesn't wait on all its sections.
  const first = useLiveQuery(async () => {
    readFrom.current ??= performance.now();
    return scope ? commentary(scope, appDb, FIRST_GROUPS) : null;
  }, [slug, kind]);
  const full = useLiveQuery(
    async () => (scope && first !== undefined ? commentary(scope) : undefined),
    [slug, kind, first !== undefined],
  );
  const data = full ?? first;
  useScreenReady('commentary', data !== undefined);

  if (!scope || !scopes) {
    return (
      <>
        <ScreenTitle>Passage not found</ScreenTitle>
        <NotFoundScreen>This address isn’t a Bible passage.</NotFoundScreen>
      </>
    );
  }
  const title = scopeTitle(scope);
  const labels = Object.fromEntries(kinds.map((k) => [k, scopeTitle(scopes[k])])) as Record<
    ScopeKind,
    string
  >;

  return (
    <div className="flex flex-col gap-4">
      <ScreenTitle>Commentary</ScreenTitle>
      <ScreenActions>
        <CommentaryMenu scope={scope} title={title} />
      </ScreenActions>
      <div className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{title}</h2>
        {kinds.length > 1 && (
          <fieldset className="min-w-0 border-0 p-0">
            <legend className="sr-only">Scope</legend>
            <Segmented
              name="commentary-scope"
              options={kinds}
              labels={labels}
              value={kind}
              onChange={(next) =>
                onSearch({
                  ...search,
                  scope: next === kinds[0] || next === 'passage' ? undefined : next,
                })
              }
            />
          </fieldset>
        )}
      </div>
      {data === undefined || data === null ? (
        <ScreenSkeleton rows={3} />
      ) : data.groups.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-8">
          <p className="text-center text-muted-foreground">
            Nothing cites {title} yet. Sections that cite it will show here as one document.
          </p>
          <ReadLink passage={scope}>Read {title}</ReadLink>
        </div>
      ) : (
        <CommentaryBody key={kind} data={data} wholeBook={isWholeBook(scope)} readFrom={readFrom} />
      )}
      <VerseViewer />
    </div>
  );
}

/** The `⋯`: Export (Markdown only) and Read the passage. */
function CommentaryMenu({ scope, title }: { scope: Passage; title: string }) {
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const { book, chapter, verseStart } = scope;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label="Commentary actions" />}
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => setExporting(true)}>Export…</DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              void navigate({
                to: '/read/$chapter',
                params: {
                  chapter: passageSlug({
                    book,
                    chapter,
                    ...(verseStart != null ? { verseStart } : {}),
                  }),
                },
              })
            }
          >
            Read {title}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ExportDialog
        open={exporting}
        onOpenChange={setExporting}
        title={`Export the commentary on ${title}`}
        description="Markdown keeps every section with its verses, lesson and date."
        load={() => exportCommentary(scope)}
      />
    </>
  );
}

/** Scrolls to a group's heading and gives it focus; false when it isn't drawn yet. */
function reach(id: string): boolean {
  const element = document.getElementById(id);
  if (!element) return false;
  element.scrollIntoView({ block: 'start' });
  element.focus({ preventScroll: true });
  return true;
}

/** One line of the document, so it can be drawn a screenful at a time. */
type Row =
  | { kind: 'chapter'; key: string; passage: Passage }
  | { kind: 'group'; key: string; id: string; group: CompileGroup<CompiledNote> }
  | { kind: 'entry'; key: string; entry: CompileEntry<CompiledNote> };

const groupId = (group: { range: readonly [number, number] }) =>
  `group-${group.range[0]}-${group.range[1]}`;
const idOf = (passage: Passage) => groupId({ range: passageRange(passage) });

function toRows(data: Commentary, wholeBook: boolean): Row[] {
  const rows: Row[] = [];
  let chapter: number | null = null;
  for (const group of data.groups) {
    const id = groupId(group);
    if (wholeBook && group.passage.chapter !== chapter) {
      chapter = group.passage.chapter;
      rows.push({
        kind: 'chapter',
        key: `chapter-${chapter}`,
        passage: { book: group.passage.book, chapter },
      });
    }
    rows.push({ kind: 'group', key: id, id, group });
    for (const entry of group.entries) {
      rows.push({ kind: 'entry', key: `${id}-${entry.item.section.id}`, entry });
    }
  }
  return rows;
}

/** Rows drawn at first, and added each turn after that: a long lesson's pace (§8.3). */
const FIRST_ROWS = 16;
const MORE_ROWS = 24;

function CommentaryBody({
  data,
  wholeBook,
  readFrom,
}: {
  data: Commentary;
  wholeBook: boolean;
  /** When the first read from the device started. */
  readFrom: RefObject<number | null>;
}) {
  const laptop = useMediaQuery(LAPTOP_QUERY);
  const rows = useMemo(() => toRows(data, wholeBook), [data, wholeBook]);
  const [shown, setShown] = useState(FIRST_ROWS);
  const target = useRef<string | null>(null);
  const slow = useAfter(300);
  const marked = useRef(false);

  // The rest arrives a batch at a time, each after the last has painted.
  useEffect(() => {
    if (shown >= rows.length) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => setShown((n) => n + MORE_ROWS), 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [shown, rows.length]);

  // The first screen's time, from reading IndexedDB to drawn, for the budget check
  // (`compile.spec.ts`).
  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    performance.mark('lamp:commentary-ready', {
      detail: { ms: performance.now() - (readFrom.current ?? 0), sections: data.sections },
    });
  }, [readFrom, data.sections]);

  // A jump to a group not drawn yet draws up to it first, then goes there.
  useEffect(() => {
    if (target.current && reach(target.current)) target.current = null;
  });

  function jump(id: string) {
    if (reach(id)) return;
    const index = rows.findIndex((row) => row.kind === 'group' && row.id === id);
    if (index < 0) return;
    target.current = id;
    setShown((n) => Math.max(n, index + MORE_ROWS));
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {count(data.sections, 'section')} in {count(data.lessons, 'lesson')}
      </p>
      <div className="flex flex-col">
        {rows.slice(0, shown).map((row) => (
          <RowView key={row.key} row={row} wholeBook={wholeBook} onJump={jump} />
        ))}
        {(shown < rows.length || !data.complete) && slow && (
          <ScreenSkeleton rows={2} className="pt-6" />
        )}
      </div>
      {laptop && <Outline data={data} wholeBook={wholeBook} rows={rows} onJump={jump} />}
    </>
  );
}

/** In a book, chapters are `h3` and their groups `h4`; otherwise groups are `h3`. */
function RowView({
  row,
  wholeBook,
  onJump,
}: {
  row: Row;
  wholeBook: boolean;
  onJump: (id: string) => void;
}) {
  if (row.kind === 'chapter') {
    return (
      <h3 className="mt-8 border-b pb-1 text-sm font-semibold tracking-wide text-muted-foreground uppercase first:mt-0">
        {formatPassage(row.passage)}
      </h3>
    );
  }
  if (row.kind === 'group') {
    return <GroupHeading id={row.id} group={row.group} level={wholeBook ? 4 : 3} />;
  }
  return <EntryView entry={row.entry} headingLevel={wholeBook ? 5 : 4} onJump={onJump} />;
}

/** A group's passage, and its text in the reading translation, as "Verse text in notes" shows it. */
function GroupHeading({
  id,
  group,
  level,
}: {
  id: string;
  group: CompileGroup<CompiledNote>;
  level: 3 | 4;
}) {
  const Heading = level === 3 ? 'h3' : 'h4';
  return (
    <div className="mt-8 flex flex-col gap-2 first:mt-2">
      <Heading
        id={id}
        tabIndex={-1}
        className="scroll-mt-20 text-sm font-semibold tracking-wide uppercase outline-none lg:scroll-mt-6"
      >
        {formatPassage(group.passage)}
      </Heading>
      {group.passage.verseStart != null && <GroupVerse passage={group.passage} />}
    </div>
  );
}

function GroupVerse({ passage }: { passage: Passage }) {
  const translation = useActiveTranslation();
  const book = useBook(translation, passage.book);
  if (book.status !== 'ready' || !isAppTranslation(translation)) return null;
  const text = snapshotText(book.text, passage, translation);
  if (!text) return null;
  return (
    <VerseText
      passage={passage}
      translation={translation}
      text={text}
      className="line-clamp-2 border-l-2 border-primary/40 pl-3 text-muted-foreground italic"
    />
  );
}

/**
 * A section, read-only, then its lesson and date linking to it there. A reply under its section is
 * indented. A section already shown under an earlier passage is a pointer to it there (M10-03).
 */
function EntryView({
  entry,
  headingLevel,
  onJump,
}: {
  entry: CompileEntry<CompiledNote>;
  /** For the headings in its text. */
  headingLevel: 4 | 5;
  onJump: (id: string) => void;
}) {
  const { section, lesson, nested } = entry.item;
  const byline = (
    <Link
      to="/lessons/$lessonId"
      params={{ lessonId: lesson.id }}
      search={{ section: section.id }}
      className="-mx-1 inline-flex w-fit items-center gap-1 rounded-md px-1 text-sm text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {lesson.title} · {shortDateWithYear(lesson.date)}
      <ChevronRight aria-hidden className="size-3.5" />
    </Link>
  );
  if (entry.shownUnder) {
    const under = formatPassage(entry.shownUnder);
    return (
      <div
        className={cn('mt-4 flex flex-wrap items-center gap-x-2', nested && 'ml-4 border-l pl-4')}
      >
        {byline}
        <button
          type="button"
          onClick={() => onJump(idOf(entry.shownUnder!))}
          className="inline-flex items-center gap-1 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowUp aria-hidden className="size-3.5" />
          Under {under}
        </button>
      </div>
    );
  }
  return (
    <article
      aria-label={`${lesson.title}, ${shortDateWithYear(lesson.date)}`}
      className={cn('mt-4 flex flex-col gap-2', nested && 'ml-4 border-l pl-4')}
    >
      <ReadOnlyBody body={section.body} headingLevel={headingLevel} />
      {byline}
      {entry.also.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Also under{' '}
          {entry.also.map((passage, i) => (
            <span key={idOf(passage)}>
              {i > 0 && ', '}
              <button
                type="button"
                onClick={() => onJump(idOf(passage))}
                className="rounded-sm underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {formatPassage(passage)}
              </button>
            </span>
          ))}
        </p>
      )}
    </article>
  );
}

/**
 * The laptop's side panel: the document's groups with how many sections each holds. A click jumps
 * to one; the one being read is marked as the page scrolls.
 */
function Outline({
  data,
  wholeBook,
  rows,
  onJump,
}: {
  data: Commentary;
  wholeBook: boolean;
  rows: Row[];
  onJump: (id: string) => void;
}) {
  const current = useCurrentGroup(rows);
  return (
    <SidePanel>
      <nav
        aria-label="In this commentary"
        className="sticky top-10 flex max-h-[calc(100svh-5rem)] flex-col gap-1 overflow-y-auto"
      >
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          In this commentary
        </h2>
        <ul className="flex flex-col">
          {data.groups.map((group, i) => {
            const id = groupId(group);
            const { book, chapter } = group.passage;
            const newChapter = wholeBook && data.groups[i - 1]?.passage.chapter !== chapter;
            return (
              <li key={id} className="flex flex-col">
                {newChapter && (
                  <span className="mt-3 text-xs font-medium text-muted-foreground">
                    {formatPassage({ book, chapter })}
                  </span>
                )}
                <button
                  type="button"
                  aria-current={current === id ? 'location' : undefined}
                  onClick={() => onJump(id)}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current]:bg-muted aria-[current]:font-medium"
                >
                  <span className="min-w-0 truncate">{formatPassage(group.passage)}</span>
                  <span className="text-muted-foreground tabular-nums">{group.entries.length}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </SidePanel>
  );
}

/** The group whose heading was last scrolled past the top of the window. */
function useCurrentGroup(rows: Row[]): string | null {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    const ids = rows.flatMap((row) => (row.kind === 'group' ? [row.id] : []));
    let frame = 0;
    function update() {
      frame = 0;
      let last: string | null = ids[0] ?? null;
      for (const id of ids) {
        const element = document.getElementById(id);
        if (!element || element.getBoundingClientRect().top > 80) break;
        last = id;
      }
      setCurrent(last);
    }
    const onScroll = () => {
      frame ||= requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [rows]);
  return current;
}
