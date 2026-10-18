import { formatPassage, parsePassageSlug } from '@lamp/domain';
import { createFileRoute } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { VerseIndexList } from '@/components/search/verse-index-list.tsx';
import { Segmented } from '@/components/segmented.tsx';
import { PassageLink, ReadLink } from '@/components/verses/passage-links.tsx';
import { ScreenTitle } from '@/components/shell/slots.tsx';
import { count } from '@/lib/labels.ts';
import { verseIndex, type VerseIndexEntry } from '@/search/results.ts';

const FILTERS = ['all', 'notes', 'highlights', 'memory'] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABELS: Record<Filter, string> = {
  all: 'All',
  notes: 'Notes',
  highlights: 'Highlights',
  memory: 'Memory',
};
const EMPTY_FILTER: Record<Exclude<Filter, 'all'>, string> = {
  notes: 'notes',
  highlights: 'highlights',
  memory: 'memory verses',
};
const isFilter = (value: unknown): value is Exclude<Filter, 'all'> =>
  typeof value === 'string' && value !== 'all' && (FILTERS as readonly string[]).includes(value);

interface VerseSearch {
  /** Which rows to list. Absent means all of them. */
  show?: Exclude<Filter, 'all'>;
}

export const Route = createFileRoute('/_app/verses/$passage')({
  staticData: { back: '/search' },
  validateSearch: (search: Record<string, unknown>): VerseSearch => ({
    show: isFilter(search.show) ? search.show : undefined,
  }),
  component: VerseIndexScreen,
});

/**
 * The verse index (F7, wireframes/verses.md "Verse index"): every note, highlight and memory verse citing a
 * passage that overlaps this one, newest first, so `ROM.8` lists Romans 7:24–8:2 too. Opened from
 * a chip and from a verse search; the address is the passage's slug.
 */
function VerseIndexScreen() {
  const { passage: slug } = Route.useParams();
  const { show } = Route.useSearch();
  const navigate = Route.useNavigate();
  const passage = parsePassageSlug(slug);
  const entries = useLiveQuery(async () => (passage ? verseIndex(passage) : []), [slug]);
  const filter: Filter = show ?? 'all';

  if (!passage) {
    return (
      <>
        <ScreenTitle>Passage not found</ScreenTitle>
        <NotFoundScreen>This address isn’t a Bible passage.</NotFoundScreen>
      </>
    );
  }
  const display = formatPassage(passage);
  if (entries === undefined) return <ScreenTitle>{display}</ScreenTitle>;

  const shown = entries.filter((entry) => matches(entry, filter));
  return (
    <div className="flex flex-col gap-4">
      <ScreenTitle>{display}</ScreenTitle>
      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-8">
          <p className="text-center text-muted-foreground">
            Nothing cites {display} yet. Notes, highlights and memory verses on it will show here.
          </p>
          <ReadLink passage={passage}>Read {display}</ReadLink>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{summary(entries)}</p>
            <div className="flex shrink-0 gap-2">
              <PassageLink
                to="/compile/$passage"
                passage={passage}
                label={`Read ${display} as commentary`}
              >
                Commentary
              </PassageLink>
              <ReadLink passage={passage} label={`Read ${display}`}>
                Read
              </ReadLink>
            </div>
          </div>
          <fieldset className="min-w-0 border-0 p-0">
            <legend className="sr-only">Show</legend>
            <Segmented
              name="verse-index"
              options={FILTERS}
              labels={FILTER_LABELS}
              value={filter}
              onChange={(next) =>
                void navigate({
                  search: { show: next === 'all' ? undefined : next },
                  replace: true,
                })
              }
            />
          </fieldset>
          {shown.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No {filter === 'all' ? 'notes' : EMPTY_FILTER[filter]} on {display}.
            </p>
          ) : (
            <VerseIndexList entries={shown} />
          )}
        </>
      )}
    </div>
  );
}

function matches(entry: VerseIndexEntry, filter: Filter): boolean {
  if (filter === 'highlights') return entry.kind === 'highlight';
  if (filter === 'memory') return entry.kind === 'memory';
  if (filter === 'notes') return entry.kind === 'lesson' || entry.kind === 'section';
  return true;
}

/**
 * "2 notes · main passage of 1 lesson · 1 highlight · 1 memory verse", leaving out what there's
 * none of.
 */
function summary(entries: VerseIndexEntry[]): string {
  const notes = entries.filter((entry) => entry.kind === 'section').length;
  const lessons = entries.filter((entry) => entry.kind === 'lesson').length;
  const highlights = entries.filter((entry) => entry.kind === 'highlight').length;
  const memory = entries.filter((entry) => entry.kind === 'memory').length;
  return [
    notes > 0 && count(notes, 'note'),
    lessons > 0 && `main passage of ${count(lessons, 'lesson')}`,
    highlights > 0 && count(highlights, 'highlight'),
    memory > 0 && count(memory, 'memory verse'),
  ]
    .filter(Boolean)
    .join(' · ');
}
