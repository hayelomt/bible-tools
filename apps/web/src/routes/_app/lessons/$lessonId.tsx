import { createFileRoute } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { LessonEditor } from '@/components/lesson/lesson-editor.tsx';
import { ScreenTitle } from '@/components/shell/slots.tsx';
import { lessonById } from '@/data/queries.ts';

interface LessonSearch {
  /** A draft from "New lesson": stored once it has a title (`newLessonTarget`). */
  new?: true;
  /** The series a draft starts in. */
  seriesId?: string;
}

export const Route = createFileRoute('/_app/lessons/$lessonId')({
  staticData: { back: '/' },
  validateSearch: (search: Record<string, unknown>): LessonSearch => ({
    new: search.new === true ? true : undefined,
    seriesId: typeof search.seriesId === 'string' ? search.seriesId : undefined,
  }),
  component: LessonScreen,
});

function LessonScreen() {
  const { lessonId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const lesson = useLiveQuery(() => lessonById(lessonId), [lessonId]);

  // Once the draft is stored, its address loses `?new`, so reloading or going back shows the lesson.
  useEffect(() => {
    if (lesson && search.new) void navigate({ search: {}, replace: true });
  }, [lesson, search.new, navigate]);

  if (lesson === undefined) return null;
  if (lesson === null && !search.new) {
    return (
      <>
        <ScreenTitle>Lesson not found</ScreenTitle>
        <NotFoundScreen>
          This lesson doesn’t exist on this device. It may have been deleted, or not synced here
          yet.
        </NotFoundScreen>
      </>
    );
  }
  return <LessonEditor key={lessonId} id={lessonId} lesson={lesson} seriesId={search.seriesId} />;
}
