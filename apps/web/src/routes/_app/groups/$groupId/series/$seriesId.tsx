import { createFileRoute, Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight } from 'lucide-react';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { ScreenTitle } from '@/components/shell/slots.tsx';
import { groupSeriesView } from '@/data/groups.ts';
import { useAccount } from '@/lib/account.ts';
import { shortDate } from '@/lib/dates.ts';
import { count, SERIES_KIND_LABELS } from '@/lib/labels.ts';

export const Route = createFileRoute('/_app/groups/$groupId/series/$seriesId')({
  staticData: { back: '../..' },
  component: GroupSeriesScreen,
});

/**
 * A series shared into the group, as its members see it: its lessons by date. The owner's own
 * lessons open as usual; another member's open on the group's thread (M13-08).
 */
function GroupSeriesScreen() {
  const { groupId, seriesId } = Route.useParams();
  const account = useAccount().data;
  const view = useLiveQuery(() => groupSeriesView(seriesId), [seriesId]);
  if (view === undefined) return <ScreenSkeleton />;
  if (view === null || view.series.groupId !== groupId) {
    return <NotFoundScreen>This series isn’t in the group any more.</NotFoundScreen>;
  }
  const { series, lessons } = view;
  const mine = series.userId === account?.id;
  return (
    <div className="flex flex-col gap-6">
      <ScreenTitle>{series.title}</ScreenTitle>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          {SERIES_KIND_LABELS[series.kind]} · {count(lessons.length, 'lesson')}
        </p>
        {series.description && (
          <p className="break-words whitespace-pre-line">{series.description}</p>
        )}
      </div>
      {lessons.length > 0 ? (
        <ul className="flex flex-col divide-y">
          {lessons.map((lesson) => (
            <li key={lesson.id}>
              <Link
                {...(mine
                  ? { to: '/lessons/$lessonId', params: { lessonId: lesson.id } }
                  : {
                      to: '/groups/$groupId/lessons/$lessonId',
                      params: { groupId, lessonId: lesson.id },
                    })}
                className="-mx-2 flex items-center gap-4 rounded-lg px-2 py-3 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="w-24 shrink-0 text-sm text-muted-foreground">
                  {shortDate(lesson.date)}
                </span>
                <span className="min-w-0 flex-1 break-words">{lesson.title}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No lessons in this series yet.</p>
      )}
    </div>
  );
}
