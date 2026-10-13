import { Button } from '@lamp/ui/components/button';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Plus } from 'lucide-react';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { SeriesMenu } from '@/components/series/series-menu.tsx';
import { ScreenActions, ScreenTitle } from '@/components/shell/slots.tsx';
import { seriesById, seriesLessons } from '@/data/queries.ts';
import { shortDate } from '@/lib/dates.ts';
import { count, SERIES_KIND_LABELS } from '@/lib/labels.ts';
import { newLessonTarget } from '@/lib/new-lesson.ts';

export const Route = createFileRoute('/_app/series/$seriesId')({
  staticData: { back: '/' },
  component: SeriesScreen,
});

/** A series and its lessons in date order, oldest first (wireframes/lessons.md "Series"). */
function SeriesScreen() {
  const { seriesId } = Route.useParams();
  const navigate = useNavigate();
  const series = useLiveQuery(() => seriesById(seriesId), [seriesId]);
  const lessons = useLiveQuery(() => seriesLessons(seriesId), [seriesId]);
  if (series === undefined || lessons === undefined) return null;
  if (series === null) {
    return (
      <>
        <ScreenTitle>Series not found</ScreenTitle>
        <NotFoundScreen>
          This series doesn’t exist on this device. It may have been deleted, or not synced here
          yet.
        </NotFoundScreen>
      </>
    );
  }

  const newLesson = (
    <Button className="self-start" onClick={() => void navigate(newLessonTarget(series.id))}>
      <Plus aria-hidden />
      <span className="truncate">New lesson in {series.title}</span>
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <ScreenTitle>{series.title}</ScreenTitle>
      <ScreenActions>
        <SeriesMenu series={series} lessonCount={lessons.length} />
      </ScreenActions>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          {SERIES_KIND_LABELS[series.kind]} · {count(lessons.length, 'lesson')}
        </p>
        {series.description && (
          <p className="break-words whitespace-pre-line">{series.description}</p>
        )}
      </div>
      {lessons.length > 0 ? (
        <>
          <ul className="flex flex-col divide-y">
            {lessons.map((lesson) => (
              <li key={lesson.id}>
                <Link
                  to="/lessons/$lessonId"
                  params={{ lessonId: lesson.id }}
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
          {newLesson}
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <p>No lessons in this series yet.</p>
          <p className="text-muted-foreground">
            Add one here, or move a lesson in from its ⋯ menu.
          </p>
          <div className="mt-2 flex max-w-full">{newLesson}</div>
        </div>
      )}
    </div>
  );
}
