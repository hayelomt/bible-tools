import { formatPassage, parsePassageSlug } from '@lamp/domain';
import { createFileRoute } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { VerseIndexList } from '@/components/search/verse-index-list.tsx';
import { ScreenTitle } from '@/components/shell/slots.tsx';
import { count } from '@/lib/labels.ts';
import { verseIndex } from '@/search/results.ts';

export const Route = createFileRoute('/_app/verses/$passage')({
  staticData: { back: '/search' },
  component: VerseIndexScreen,
});

/**
 * The verse index (F7, wireframes/verses.md "Verse index"): every note citing a passage that
 * overlaps this one, newest first, so `ROM.8` lists Romans 7:24–8:2 too. Opened from a chip and
 * from a verse search; the address is the passage's slug.
 */
function VerseIndexScreen() {
  const { passage: slug } = Route.useParams();
  const passage = parsePassageSlug(slug);
  const entries = useLiveQuery(async () => (passage ? verseIndex(passage) : []), [slug]);

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

  const notes = entries.filter((e) => e.kind === 'section').length;
  const lessons = entries.length - notes;
  const summary = [
    notes > 0 && count(notes, 'note'),
    lessons > 0 && `main passage of ${count(lessons, 'lesson')}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="flex flex-col gap-4">
      <ScreenTitle>{display}</ScreenTitle>
      {entries.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          Nothing cites {display} yet. Notes that cite it will show here.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground first-letter:uppercase">{summary}</p>
          <VerseIndexList entries={entries} />
        </>
      )}
    </div>
  );
}
