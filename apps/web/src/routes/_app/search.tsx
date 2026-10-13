import { passageSlug } from '@lamp/domain';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowUpLeft, ChevronRight, Search, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ResultList } from '@/components/search/result-list.tsx';
import { count } from '@/lib/labels.ts';
import { recentSearches, rememberSearch } from '@/lib/recent-searches.ts';
import { searchText, useIndexStatus } from '@/search/client.ts';
import {
  parseQuery,
  type ParsedQuery,
  type ResultGroup,
  tagNamed,
  tagResults,
  tagSuggestions,
  textResults,
  verseResults,
} from '@/search/results.ts';

interface SearchParams {
  /** What's in the box, so going back to search shows the same results. */
  q?: string;
}

export const Route = createFileRoute('/_app/search')({
  staticData: { title: 'Search' },
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
  }),
  component: SearchScreen,
});

/** Rows per lesson before "+ N more in this lesson". */
const PER_LESSON = 3;
const EXAMPLES = ['Romans 8', '#grace', 'shepherd'];

/**
 * Search (F6, wireframes/search.md): one box for free text, `#tags` and verses, told apart as
 * they're typed. Results update as the user types and are grouped by lesson; a result opens the
 * lesson at the match. Everything is on the device, so it works offline.
 */
function SearchScreen() {
  const { q = '' } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [input, setInput] = useState(q);
  // The address changed from outside (Back, or Search in the bottom bar): the box follows it.
  const [seen, setSeen] = useState(q);
  if (q !== seen) {
    setSeen(q);
    setInput(q);
  }

  function change(value: string) {
    setInput(value);
    setSeen(value.trim() ? value : '');
    void navigate({ search: { q: value.trim() ? value : undefined }, replace: true });
  }

  const query = parseQuery(input);
  const remember = () => rememberSearch(input);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={input}
          aria-label="Search"
          placeholder="Notes, #tags or verses"
          enterKeyHint="search"
          autoComplete="off"
          // The screen is for typing a search (wireframes/search.md).
          // oxlint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          className="h-11 w-full rounded-xl border border-input bg-transparent pr-11 pl-9 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
          onChange={(event) => change(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && input) {
              event.preventDefault();
              change('');
            }
          }}
        />
        {input && (
          <button
            type="button"
            aria-label="Clear search"
            className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={() => change('')}
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>

      {query.kind === 'empty' && <BeforeTyping onPick={change} />}
      {query.kind === 'text' && <TextResults text={query.text} onOpen={remember} />}
      {query.kind === 'verse' && <VerseResults query={query} onOpen={remember} />}
      {query.kind === 'tag' && (
        <TagResults
          name={query.name}
          onPick={(name) => {
            change(`#${name}`);
            rememberSearch(`#${name}`);
          }}
          onOpen={remember}
        />
      )}
    </div>
  );
}

/** Examples to try, and the last searches on this device. */
function BeforeTyping({ onPick }: { onPick: (query: string) => void }) {
  const [recent] = useState(recentSearches);
  return (
    <>
      <p className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
        Try
        {EXAMPLES.map((example, i) => (
          <span key={example} className="flex items-center gap-x-1">
            {i > 0 && <span aria-hidden>·</span>}
            <button
              type="button"
              className="rounded-md px-1 text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
              onClick={() => onPick(example)}
            >
              {example}
            </button>
          </span>
        ))}
      </p>
      {recent.length > 0 && (
        <section aria-labelledby="recent-searches" className="flex flex-col">
          <h2
            id="recent-searches"
            className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            Recent
          </h2>
          <ul className="mt-1 flex flex-col">
            {recent.map((query) => (
              <li key={query}>
                <button
                  type="button"
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-lg px-2 py-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  onClick={() => onPick(query)}
                >
                  <span className="min-w-0 truncate">{query}</span>
                  <ArrowUpLeft aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** The latest results for `text`; earlier ones stay up while the next arrive, so nothing jumps. */
function useTextSearch(text: string) {
  const [state, setState] = useState<{ text: string; groups: ResultGroup[] | 'failed' }>();
  useEffect(() => {
    let current = true;
    searchText(text)
      .then((hits) => textResults(hits))
      .then(
        (groups) => current && setState({ text, groups }),
        (error: unknown) => {
          console.error(error);
          if (current) setState({ text, groups: 'failed' });
        },
      );
    return () => {
      current = false;
    };
  }, [text]);
  return state;
}

/** True once `ms` have passed: placeholders show only for a wait worth showing (UX-PATTERNS). */
function useAfter(ms: number) {
  const [passed, setPassed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setPassed(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return passed;
}

function TextResults({ text, onOpen }: { text: string; onOpen: () => void }) {
  const status = useIndexStatus();
  const state = useTextSearch(text);
  const slow = useAfter(300);

  if (status === 'failed' || state?.groups === 'failed') {
    return (
      <p className="py-8 text-center text-muted-foreground">
        Search couldn’t start on this device. Reload the app to try again; tags and verses still
        work.
      </p>
    );
  }
  if (!state) {
    return status !== 'ready' ? (
      <output className="flex flex-col gap-3">
        <span className="text-sm text-muted-foreground">Preparing search…</span>
        {slow && (
          <>
            <span className="h-4 w-11/12 animate-pulse rounded bg-muted" />
            <span className="h-4 w-3/4 animate-pulse rounded bg-muted" />
          </>
        )}
      </output>
    ) : null;
  }
  const { groups } = state;
  if (groups.length === 0) {
    return (
      <div className="flex flex-col gap-1 py-8 text-center text-muted-foreground">
        <p>Nothing matches “{state.text}”.</p>
        <p className="text-sm">
          Search looks in lesson titles, sections, takeaways and questions. Try a verse, like
          Hebrews 7.
        </p>
      </div>
    );
  }
  const results = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <>
      <output className="text-sm text-muted-foreground">
        {count(results, 'result')} in {count(groups.length, 'lesson')}
      </output>
      <ResultList groups={groups} perLesson={PER_LESSON} onOpen={onOpen} />
    </>
  );
}

function VerseResults({
  query,
  onOpen,
}: {
  query: Extract<ParsedQuery, { kind: 'verse' }>;
  onOpen: () => void;
}) {
  const { passage } = query;
  const groups = useLiveQuery(() => verseResults(passage), [passage.display]);
  if (!groups) return null;
  if (groups.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">No notes cite {passage.display} yet.</p>
    );
  }
  const notes = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <>
      <output className="text-sm text-muted-foreground">
        {passage.display} · {count(notes, 'note')}
      </output>
      <Link
        to="/verses/$passage"
        params={{ passage: passageSlug(passage) }}
        className="-mx-2 flex items-center justify-between rounded-lg px-2 py-2 font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={onOpen}
      >
        Verse index for {passage.display}
        <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
      </Link>
      <ResultList groups={groups} perLesson={PER_LESSON} onOpen={onOpen} />
    </>
  );
}

function TagResults({
  name,
  onPick,
  onOpen,
}: {
  name: string;
  onPick: (name: string) => void;
  onOpen: () => void;
}) {
  const tag = useLiveQuery(() => tagNamed(name), [name]);
  const suggestions = useLiveQuery(() => (tag ? [] : tagSuggestions(name)), [name, tag]);
  const groups = useLiveQuery(async () => (tag ? tagResults(tag.id) : []), [tag?.id]);

  if (tag === undefined || suggestions === undefined || groups === undefined) return null;
  if (tag) {
    return (
      <>
        <Link
          to="/tags/$tagId"
          params={{ tagId: tag.id }}
          className="-mx-2 flex items-center justify-between rounded-lg px-2 py-2 font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={onOpen}
        >
          Open #{tag.name}
          <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
        </Link>
        {groups.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">No notes tagged #{tag.name} yet.</p>
        ) : (
          <ResultList groups={groups} perLesson={PER_LESSON} onOpen={onOpen} />
        )}
      </>
    );
  }
  if (suggestions.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">No tag #{name}.</p>;
  }
  return (
    <ul aria-label="Tags" className="flex flex-col rounded-xl border p-1">
      {suggestions.map(({ tag: suggestion, uses }) => (
        <li key={suggestion.id}>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={() => onPick(suggestion.name)}
          >
            <span className="min-w-0 truncate">#{suggestion.name}</span>{' '}
            <span className="text-sm text-muted-foreground">· {uses}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
