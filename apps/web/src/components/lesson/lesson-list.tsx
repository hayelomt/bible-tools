import type { Lesson, Series } from '@lamp/domain';
import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { conflictCounts } from '@/data/queries.ts';
import { shortDate } from '@/lib/dates.ts';
import { count } from '@/lib/labels.ts';

interface LessonListProps {
  lessons: Lesson[];
  /** To name each lesson's series; left out where they're all in one. */
  series?: Pick<Series, 'id' | 'title'>[];
}

/**
 * Lessons as rows: title, then date · main passages · series (wireframes/lessons.md), and how many
 * conflicted copies wait to be resolved (wireframes/sync.md).
 */
export function LessonList({ lessons, series }: LessonListProps) {
  const seriesTitle = new Map(series?.map((s) => [s.id, s.title]));
  const conflicts = useLiveQuery(() => conflictCounts(), []);
  return (
    <ul data-slot="row-list" className="flex flex-col divide-y">
      {lessons.map((lesson) => {
        const meta = [
          shortDate(lesson.date),
          lesson.mainPassages.map((p) => p.display).join(', '),
          lesson.seriesId && seriesTitle.get(lesson.seriesId),
        ].filter(Boolean);
        const copies = conflicts?.get(lesson.id) ?? 0;
        return (
          <li key={lesson.id}>
            <Link
              to="/lessons/$lessonId"
              params={{ lessonId: lesson.id }}
              className="-mx-2 flex flex-col gap-0.5 rounded-lg px-2 py-3 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span data-slot="row-title" className="font-medium break-words">
                {lesson.title}
              </span>
              <span data-slot="row-meta" className="text-sm break-words text-muted-foreground">
                {meta.join(' · ')}
              </span>
              {copies > 0 && (
                <span data-slot="row-conflicts" className="text-sm font-medium">
                  {count(copies, 'conflicted copy', 'conflicted copies')}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
