import { toPlainText } from '@lamp/domain';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight } from 'lucide-react';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { ScreenActions, ScreenTitle } from '@/components/shell/slots.tsx';
import { TagMenu } from '@/components/tags/tag-menu.tsx';
import { tagById, taggedWith } from '@/data/queries.ts';
import { shortDate } from '@/lib/dates.ts';
import { count } from '@/lib/labels.ts';

export const Route = createFileRoute('/_app/tags/$tagId')({
  staticData: { back: '/' },
  component: TagScreen,
});

const ROW_LINK =
  '-mx-2 flex items-start gap-3 rounded-lg px-2 py-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * A tag page (F4, wireframes/lessons.md "Tag page"): every section and lesson with the tag,
 * grouped by lesson, newest lesson first. A section opens its lesson scrolled to it.
 */
function TagScreen() {
  const { tagId } = Route.useParams();
  const tag = useLiveQuery(() => tagById(tagId), [tagId]);
  const groups = useLiveQuery(() => taggedWith(tagId), [tagId]);
  if (tag === undefined || groups === undefined) return null;
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

  const sections = groups.reduce((n, g) => n + g.sections.length, 0);
  const uses = sections + groups.filter((g) => g.lessonTagged).length;

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
          <ul className="flex flex-col divide-y">
            {groups.map(({ lesson, lessonTagged, sections: tagged }) => (
              <li key={lesson.id} className="flex flex-col gap-1 py-4 first:pt-0">
                <h2 className="text-xs font-medium tracking-wide break-words text-muted-foreground uppercase">
                  {lesson.title} · {shortDate(lesson.date)}
                </h2>
                {lessonTagged && (
                  <Link
                    to="/lessons/$lessonId"
                    params={{ lessonId: lesson.id }}
                    className={ROW_LINK}
                  >
                    <span className="min-w-0 flex-1 text-muted-foreground italic">
                      The whole lesson is tagged.
                    </span>
                    <ChevronRight
                      aria-hidden
                      className="mt-1 size-4 shrink-0 text-muted-foreground"
                    />
                  </Link>
                )}
                {tagged.map((section) => (
                  <Link
                    key={section.id}
                    to="/lessons/$lessonId"
                    params={{ lessonId: lesson.id }}
                    search={{ section: section.id }}
                    className={ROW_LINK}
                  >
                    <span
                      className={`line-clamp-3 min-w-0 flex-1 font-serif break-words whitespace-pre-line ${section.parentId ? 'pl-4' : ''}`}
                    >
                      {toPlainText(section.body) || (
                        <span className="text-muted-foreground italic">Empty note</span>
                      )}
                    </span>
                    <ChevronRight
                      aria-hidden
                      className="mt-1 size-4 shrink-0 text-muted-foreground"
                    />
                  </Link>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
