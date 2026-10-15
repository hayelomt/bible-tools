import { parsePassageSlug } from '@lamp/domain';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { Reader } from '@/components/reader/reader.tsx';
import { ScreenTitle } from '@/components/shell/slots.tsx';
import { chapterSlug } from '@/lib/chapters.ts';
import { rememberPosition } from '@/lib/reading-position.ts';

export const Route = createFileRoute('/_app/read/$chapter')({
  // A verse in the address (`JHN.10.11`) opens its chapter there: it becomes the place to reopen
  // at, and the address the chapter's, so a reload keeps the place scrolled to since.
  beforeLoad: ({ params }) => {
    const passage = parsePassageSlug(params.chapter);
    if (passage?.verseStart === undefined) return;
    const { book, chapter, verseStart } = passage;
    rememberPosition({ book, chapter, verse: verseStart });
    throw redirect({
      to: '/read/$chapter',
      params: { chapter: chapterSlug({ book, chapter }) },
      replace: true,
    });
  },
  component: ReaderScreen,
});

/** The reader (F8, wireframes/reader.md "Chapter view"): one chapter of the active translation, at `JHN.10`. */
function ReaderScreen() {
  const { chapter: slug } = Route.useParams();
  const passage = parsePassageSlug(slug);
  if (!passage) {
    return (
      <>
        <ScreenTitle>Passage not found</ScreenTitle>
        <NotFoundScreen>This address isn’t a Bible passage.</NotFoundScreen>
      </>
    );
  }
  const { book, chapter } = passage;
  return <Reader key={`${book}.${chapter}`} at={{ book, chapter }} />;
}
