import { createFileRoute } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { ScreenActions, ScreenTitle } from '@/components/shell/slots.tsx';
import { TagMenu } from '@/components/tags/tag-menu.tsx';
import { ResultList } from '@/components/search/result-list.tsx';
import { tagById } from '@/data/queries.ts';
import { count } from '@/lib/labels.ts';
import { tagResults } from '@/search/results.ts';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';

export const Route = createFileRoute('/_app/tags/$tagId')({
  staticData: { back: '/' },
  component: TagScreen,
});

/**
 * A tag page (F4, wireframes/lessons.md "Tag page"): every section and lesson with the tag,
 * grouped by lesson, newest lesson first. A section opens its lesson scrolled to it.
 */
function TagScreen() {
  const { tagId } = Route.useParams();
  const tag = useLiveQuery(() => tagById(tagId), [tagId]);
  const groups = useLiveQuery(() => tagResults(tagId), [tagId]);
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
      {groups.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">No notes tagged #{tag.name} yet.</p>
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
