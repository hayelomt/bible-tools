import { createFileRoute } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { LessonList } from '@/components/lesson/lesson-list.tsx';
import { lessonsAndSeries } from '@/data/queries.ts';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { useScreenReady } from '@/lib/screen-ready.ts';

export const Route = createFileRoute('/_app/lessons/')({
  staticData: { title: 'All lessons', back: '/' },
  component: AllLessons,
});

/** Every lesson, newest first: "Show all" from the lessons home. */
function AllLessons() {
  const both = useLiveQuery(() => lessonsAndSeries(), []);
  useScreenReady('all lessons', both !== undefined);
  if (!both) return <ScreenSkeleton />;
  const { lessons, series } = both;
  if (lessons.length === 0) return <p className="text-muted-foreground">No lessons yet.</p>;
  return <LessonList lessons={lessons} series={series} />;
}
