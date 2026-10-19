import { Button } from '@lamp/ui/components/button';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { LessonList } from '@/components/lesson/lesson-list.tsx';
import { DigestCard } from '@/components/digest/digest-card.tsx';
import { PrepCard } from '@/components/lesson/prep-card.tsx';
import { SeriesDialog } from '@/components/series/series-dialog.tsx';
import { Welcome } from '@/components/welcome.tsx';
import { PageSection } from '@/components/page-section.tsx';
import { lessonsAndSeries } from '@/data/queries.ts';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { useScreenReady } from '@/lib/screen-ready.ts';
import { count } from '@/lib/labels.ts';
import { newLessonTarget } from '@/lib/new-lesson.ts';
import { useWelcomed } from '@/lib/welcome.ts';

/** How many lessons the home screen lists before "Show all". */
const RECENT = 5;

export const Route = createFileRoute('/_app/')({
  staticData: { title: 'Lessons' },
  component: LessonsHome,
});

/**
 * The lessons home (F1, wireframes/lessons.md "Lessons home"): "New lesson" first and one tap,
 * the digest card (F32) and the prep card (F29) under it, the recent lessons, then the series. A new device first picks its mode (`Welcome`), then a first
 * run shows a welcome that leads to the first lesson.
 */
function LessonsHome() {
  const navigate = useNavigate();
  const both = useLiveQuery(() => lessonsAndSeries(), []);
  const [creatingSeries, setCreatingSeries] = useState(false);
  const welcomed = useWelcomed();
  useScreenReady('lessons', both !== undefined);
  if (!both) return <ScreenSkeleton />;
  const { lessons, series } = both;
  // Someone with lessons already set the app up before the welcome existed.
  if (!welcomed && lessons.length === 0 && series.length === 0) return <Welcome />;

  const newLesson = (
    <Button size="lg" onClick={() => void navigate(newLessonTarget())}>
      <Plus aria-hidden />
      New lesson
    </Button>
  );

  return (
    <div className="flex flex-col gap-8">
      {lessons.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-xl">Your notes start here.</p>
          <p className="max-w-xs text-muted-foreground">
            Capture a sermon or a study. It’s saved on this device and works offline; no account
            needed.
          </p>
          <div className="mt-2">{newLesson}</div>
          <Link
            to="/read"
            className="flex items-center gap-1 rounded-md text-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
          >
            Or open the Bible to read
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col *:w-full">{newLesson}</div>
          <DigestCard />
          <PrepCard />
          <PageSection title="Recent">
            <LessonList lessons={lessons.slice(0, RECENT)} series={series} />
            {lessons.length > RECENT && (
              <Link
                to="/lessons"
                className="flex items-center gap-1 self-start rounded-md text-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
              >
                Show all {count(lessons.length, 'lesson')}
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            )}
          </PageSection>
        </>
      )}

      {(lessons.length > 0 || series.length > 0) && (
        <PageSection
          title="Series"
          action={
            <Button variant="ghost" size="sm" onClick={() => setCreatingSeries(true)}>
              <Plus aria-hidden />
              New<span className="sr-only"> series</span>
            </Button>
          }
        >
          {series.length > 0 ? (
            <ul data-slot="row-list" className="flex flex-col divide-y">
              {series.map((s) => (
                <li key={s.id}>
                  <Link
                    to="/series/$seriesId"
                    params={{ seriesId: s.id }}
                    className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-3 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span data-slot="row-title" className="min-w-0 flex-1 break-words">
                      {s.title}
                      <span className="text-muted-foreground">
                        {' '}
                        · {count(s.lessonCount, 'lesson')}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Group lessons into a series to keep them in order.
            </p>
          )}
        </PageSection>
      )}
      <SeriesDialog
        open={creatingSeries}
        onOpenChange={setCreatingSeries}
        onSaved={(created) =>
          void navigate({ to: '/series/$seriesId', params: { seriesId: created.id } })
        }
      />
    </div>
  );
}
