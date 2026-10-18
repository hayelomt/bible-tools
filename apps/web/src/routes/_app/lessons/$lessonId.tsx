import { createFileRoute } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { LessonEditor } from '@/components/lesson/lesson-editor.tsx';
import { ScreenTitle } from '@/components/shell/slots.tsx';
import { lessonById } from '@/data/queries.ts';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { useRecentLesson } from '@/lib/recent-lesson.ts';
import { useScreenReady } from '@/lib/screen-ready.ts';

interface LessonSearch {
  /** A draft from "New lesson": stored once it has a title (`newLessonTarget`). */
  new?: true;
  /** The series a draft starts in. */
  seriesId?: string;
  /** A section, takeaway or question to scroll to and highlight briefly (a search result). */
  section?: string;
  takeaway?: string;
  question?: string;
  /** A question to answer in a new section as the lesson opens (the review queue's Answer). */
  answer?: string;
}

export const Route = createFileRoute('/_app/lessons/$lessonId')({
  staticData: { back: '/' },
  validateSearch: (search: Record<string, unknown>): LessonSearch => ({
    new: search.new === true ? true : undefined,
    seriesId: typeof search.seriesId === 'string' ? search.seriesId : undefined,
    section: typeof search.section === 'string' ? search.section : undefined,
    takeaway: typeof search.takeaway === 'string' ? search.takeaway : undefined,
    question: typeof search.question === 'string' ? search.question : undefined,
    answer: typeof search.answer === 'string' ? search.answer : undefined,
  }),
  component: LessonScreen,
});

function LessonScreen() {
  const { lessonId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const lesson = useLiveQuery(() => lessonById(lessonId), [lessonId]);
  useScreenReady('lesson', lesson !== undefined);
  // A share in the next 10 minutes offers this lesson (F18).
  useRecentLesson(lesson ? lessonId : null);

  // Once the draft is stored, its address loses `?new`, so reloading or going back shows the lesson.
  useEffect(() => {
    if (lesson && search.new) void navigate({ search: {}, replace: true });
  }, [lesson, search.new, navigate]);

  // An answer is asked for once (the editor reads it as it opens); reloading or going back shows
  // the lesson as it is.
  useEffect(() => {
    if (lesson && search.answer) {
      void navigate({ search: (prev) => ({ ...prev, answer: undefined }), replace: true });
    }
  }, [lesson, search.answer, navigate]);

  if (lesson === undefined) return <ScreenSkeleton />;
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
  return (
    <LessonEditor
      key={lessonId}
      id={lessonId}
      lesson={lesson}
      seriesId={search.seriesId}
      reveal={search}
      answer={search.answer}
    />
  );
}
