import { type BookCode, getBook, isBookCode } from '@lamp/domain';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { monthLong } from '@/components/themes/theme-map.tsx';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { ScreenActions, ScreenTitle } from '@/components/shell/slots.tsx';
import { TagMenu } from '@/components/tags/tag-menu.tsx';
import { ResultList } from '@/components/search/result-list.tsx';
import { tagById } from '@/data/queries.ts';
import { count } from '@/lib/labels.ts';
import { type TagFilter, tagResults } from '@/search/results.ts';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';

export const Route = createFileRoute('/_app/tags/$tagId')({
  staticData: { back: '/' },
  // A month (`2026-03`) or a book, from a cell of the theme map (F31).
  validateSearch: (search: Record<string, unknown>): TagFilter => ({
    month:
      typeof search.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(search.month)
        ? search.month
        : undefined,
    book:
      typeof search.book === 'string' && isBookCode(search.book)
        ? (search.book as BookCode)
        : undefined,
  }),
  component: TagScreen,
});

/**
 * A tag page (F4, wireframes/lessons.md "Tag page"): every section and lesson with the tag,
 * grouped by lesson, newest lesson first. A section opens its lesson scrolled to it. From the
 * theme map it shows one month's notes, or one book's.
 */
function TagScreen() {
  const { tagId } = Route.useParams();
  const { month, book } = Route.useSearch();
  const tag = useLiveQuery(() => tagById(tagId), [tagId]);
  const groups = useLiveQuery(
    () => tagResults(tagId, undefined, { month, book }),
    [tagId, month, book],
  );
  if (tag === undefined || groups === undefined) return <ScreenSkeleton />;
  if (tag === null) {
    return (
      <>
        <ScreenTitle>Tag not found</ScreenTitle>
        <NotFoundScreen>
          This tag doesn’t exist on this device. It may have been deleted or renamed, or not synced
          here yet.
        </NotFoundScreen>
      </>
    );
  }

  const uses = groups.reduce((n, g) => n + g.items.length, 0);
  const sections = groups.reduce(
    (n, g) => n + g.items.filter((i) => i.kind === 'section').length,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <ScreenTitle>#{tag.name}</ScreenTitle>
      <ScreenActions>
        <TagMenu tag={tag} uses={uses} />
      </ScreenActions>
      {(month || book) && (
        <p className="flex flex-wrap items-center gap-x-3">
          <span className="font-medium">{month ? monthLong(month) : getBook(book!).name}</span>
          <Link
            to="/tags/$tagId"
            params={{ tagId }}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Show every note
          </Link>
        </p>
      )}
      {groups.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          {month || book ? 'Nothing here now.' : `No notes tagged #${tag.name} yet.`}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {sections > 0
              ? `${count(sections, 'section')} in ${count(groups.length, 'lesson')}`
              : count(groups.length, 'lesson')}
          </p>
          <ResultList groups={groups} />
        </>
      )}
    </div>
  );
}
