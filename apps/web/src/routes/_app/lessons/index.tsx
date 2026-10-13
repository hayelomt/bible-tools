import { createFileRoute } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { LessonList } from '@/components/lesson/lesson-list.tsx';
import { allLessons, allSeries } from '@/data/queries.ts';

export const Route = createFileRoute('/_app/lessons/')({
  staticData: { title: 'All lessons', back: '/' },
  component: AllLessons,
});

/** Every lesson, newest first: "Show all" from the lessons home. */
function AllLessons() {
  const lessons = useLiveQuery(() => allLessons(), []);
  const series = useLiveQuery(() => allSeries(), []);
  if (!lessons || !series) return null;
  if (lessons.length === 0) return <p className="text-muted-foreground">No lessons yet.</p>;
  return <LessonList lessons={lessons} series={series} />;
}
