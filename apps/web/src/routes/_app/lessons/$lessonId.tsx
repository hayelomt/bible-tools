import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { type ThreadMode, threadModeOf } from '@/components/groups/thread-switch.tsx';
import { db } from '@/data/db.ts';
import { threadOf } from '@/data/group-thread.ts';
import { useAccount } from '@/lib/account.ts';
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
  /** With `answer`: a partial answer (the question thread's "Add a partial answer"). */
  partial?: true;
  /** In a shared series: which thread shows (M13-08); the group's unless it says otherwise. */
  thread?: ThreadMode;
  /** A group question to answer in the group thread (the group queue's Answer, M13-10). */
  groupAnswer?: string;
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
    partial: search.partial === true ? true : undefined,
    thread: threadModeOf(search.thread),
    groupAnswer: typeof search.groupAnswer === 'string' ? search.groupAnswer : undefined,
  }),
  component: LessonScreen,
});

function LessonScreen() {
  const { lessonId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const lesson = useLiveQuery(() => lessonById(lessonId), [lessonId]);
  const me = useAccount().data?.id;
  const thread = useLiveQuery(async () => (lesson ? threadOf(lesson) : null), [lesson]);
  // A section to show is in the thread it's in.
  const revealed = useLiveQuery(
    async () => (search.section ? ((await db.section.get(search.section)) ?? null) : null),
    [search.section],
  );
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
      void navigate({
        search: (prev) => ({ ...prev, answer: undefined, partial: undefined }),
        replace: true,
      });
    }
  }, [lesson, search.answer, navigate]);

  if (lesson === undefined || (lesson && thread === undefined)) return <ScreenSkeleton />;
  // The user's own lesson for another member's lesson opens where the group has it (§17.12).
  if (lesson?.groupLessonId && thread) {
    return (
      <Navigate
        to="/groups/$groupId/lessons/$lessonId"
        params={{ groupId: thread.groupId, lessonId: thread.groupLessonId }}
        search={{ thread: search.thread }}
        replace
      />
    );
  }
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
      answer={search.answer && { questionId: search.answer, partial: search.partial === true }}
      group={
        thread && me
          ? {
              place: thread,
              me,
              // What's asked for in the lesson's own notes is in My notes.
              mode:
                search.thread ??
                (revealed?.visibility === 'group'
                  ? 'group'
                  : search.answer || search.section || search.takeaway || search.question
                    ? 'mine'
                    : 'group'),
              onModeChange: (mode) =>
                void navigate({ search: (prev) => ({ ...prev, thread: mode }), replace: true }),
              answer: search.groupAnswer,
            }
          : undefined
      }
    />
  );
}
