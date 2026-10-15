import type { Glossary, GlossaryEntry, GlossaryKind, PageVerse } from '@lamp/bible-data';
import { formatPassage } from '@lamp/domain';
import { buttonVariants } from '@lamp/ui/components/button';
import { Input } from '@lamp/ui/components/input';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@lamp/ui/components/sheet';
import { BookA } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { loadGlossary } from './page-verses.ts';

/** What the page holds: a chapter, or the passages a lesson cites. */
export type DictionaryScope = 'chapter' | 'lesson';

const KIND_LABEL: Record<GlossaryKind, string> = {
  obsolete: 'Old word',
  shifted: 'Changed meaning',
  phrase: 'Phrase',
};

/** Verses listed under an entry before "and n more". */
const SHOWN_VERSES = 6;

/**
 * The KJV dictionary: a header button, shown by the screen only where there is KJV
 * text, that opens a bottom sheet of the old words on the page and a search of the whole
 * glossary. Like the theme sheet it stays a sheet on a laptop, centred and no wider than the
 * column. `load` gives the page's verses; it runs each time the sheet opens.
 */
export function DictionaryButton({
  scope,
  load,
}: {
  scope: DictionaryScope;
  load: () => Promise<PageVerse[]>;
}) {
  return (
    <Sheet>
      <SheetTrigger
        aria-label="KJV dictionary"
        data-slot="button"
        className={buttonVariants({ variant: 'ghost', size: 'icon' })}
      >
        <BookA />
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[85svh] w-full max-w-2xl gap-0 rounded-t-2xl border-x pb-[env(safe-area-inset-bottom)] motion-reduce:data-ending-style:translate-y-0 motion-reduce:data-starting-style:translate-y-0"
      >
        <div className="px-4 pt-4 pb-2">
          <SheetTitle className="text-lg">KJV dictionary</SheetTitle>
        </div>
        <DictionaryLoader scope={scope} load={load} />
      </SheetContent>
    </Sheet>
  );
}

function DictionaryLoader({
  scope,
  load,
}: {
  scope: DictionaryScope;
  load: () => Promise<PageVerse[]>;
}) {
  const [loaded, setLoaded] = useState<{ glossary: Glossary; verses: PageVerse[] } | null>(null);
  // Once per opening: the sheet's content mounts as it opens.
  const [pending] = useState(() => Promise.all([loadGlossary(), load()]));
  useEffect(() => {
    let live = true;
    void pending.then(([glossary, verses]) => {
      if (live) setLoaded({ glossary, verses });
    });
    return () => {
      live = false;
    };
  }, [pending]);
  return (
    <DictionaryPanel
      glossary={loaded?.glossary ?? null}
      verses={loaded?.verses ?? []}
      scope={scope}
    />
  );
}

/** The search box, then the page's words and grammar notes, or the words matching the search. */
export function DictionaryPanel({
  glossary,
  verses,
  scope,
}: {
  /** Null while it loads. */
  glossary: Glossary | null;
  verses: readonly PageVerse[];
  scope: DictionaryScope;
}) {
  const [query, setQuery] = useState('');
  const page = useMemo(() => glossary?.find(verses), [glossary, verses]);
  const results = useMemo(() => (query.trim() ? glossary?.search(query) : null), [glossary, query]);

  return (
    <>
      <div className="px-4 pb-3">
        {/* Focused as the sheet opens, except by touch: the list shows, not the keyboard. */}
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a word or phrase"
          aria-label="Search the dictionary"
          enterKeyHint="search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {!glossary || !page ? null : results ? (
          <SearchResults query={query} entries={results} />
        ) : (
          <PageWords hits={page.hits} rules={page.rules} scope={scope} />
        )}
        <p className="mt-6 text-xs text-muted-foreground">
          From W. A. Wright’s <cite>Bible Word-Book</cite> (1884), with modern meanings.
        </p>
      </div>
    </>
  );
}

function PageWords({
  hits,
  rules,
  scope,
}: {
  hits: ReturnType<Glossary['find']>['hits'];
  rules: ReturnType<Glossary['find']>['rules'];
  scope: DictionaryScope;
}) {
  const where = scope === 'chapter' ? 'this chapter' : 'this lesson';
  if (hits.length === 0 && rules.length === 0) {
    return <p className="py-4 text-muted-foreground">No old words in {where}.</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      {hits.length > 0 && (
        <section aria-labelledby="dictionary-page">
          <h3 id="dictionary-page" className="mb-2 text-sm font-medium text-muted-foreground">
            In {where}
          </h3>
          <ul className="flex flex-col divide-y">
            {hits.map((hit) => (
              <EntryItem
                key={hit.entry.term}
                entry={hit.entry}
                where={verseList(hit.verses, scope)}
              />
            ))}
          </ul>
        </section>
      )}
      {rules.length > 0 && (
        <section aria-labelledby="dictionary-grammar">
          <h3 id="dictionary-grammar" className="mb-2 text-sm font-medium text-muted-foreground">
            Grammar
          </h3>
          <ul className="flex flex-col divide-y">
            {rules.map((rule) => (
              <li key={rule.id} className="py-3">
                <p className="font-medium">{rule.title}</p>
                <p className="text-muted-foreground">{rule.meaning}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SearchResults({ query, entries }: { query: string; entries: GlossaryEntry[] }) {
  if (entries.length === 0) {
    return <p className="py-4 text-muted-foreground">No words match “{query.trim()}”.</p>;
  }
  return (
    <ul aria-label="Results" className="flex flex-col divide-y">
      {entries.map((entry) => (
        <EntryItem key={entry.term} entry={entry} />
      ))}
    </ul>
  );
}

function EntryItem({ entry, where }: { entry: GlossaryEntry; where?: string }) {
  return (
    <li className="flex flex-col gap-0.5 py-3">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <dfn className="font-serif text-lg font-medium not-italic">{entry.term}</dfn>
        <span className="text-xs text-muted-foreground">{KIND_LABEL[entry.kind]}</span>
      </p>
      <p>{entry.meaning}</p>
      {entry.note && <p className="text-sm text-muted-foreground">{entry.note}</p>}
      {where && <p className="text-xs text-muted-foreground">{where}</p>}
    </li>
  );
}

/** "Verses 5, 7" in a chapter; "John 3:5, Romans 1:13" in a lesson; "and 3 more" past six. */
export function verseList(verses: readonly PageVerse[], scope: DictionaryScope): string {
  const shown = verses.slice(0, SHOWN_VERSES);
  const more = verses.length - shown.length;
  const labels =
    scope === 'chapter'
      ? `${shown.length === 1 ? 'Verse' : 'Verses'} ${shown.map((v) => v.verse).join(', ')}`
      : shown
          .map((v) => formatPassage({ book: v.book, chapter: v.chapter, verseStart: v.verse }))
          .join(', ');
  return more > 0 ? `${labels} and ${more} more` : labels;
}
