import { formatPassage } from '@lamp/domain';
import { createFileRoute } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { ScreenTitle } from '@/components/shell/slots.tsx';
import { db } from '@/data/db.ts';
import { longDate } from '@/lib/dates.ts';
import { KIND_LABELS } from '@/lib/labels.ts';

export const Route = createFileRoute('/_app/groups/$groupId/lessons/$lessonId')({
  staticData: { back: '../..' },
  component: GroupLessonScreen,
});

/**
 * Another member's lesson in a shared series, read-only: its details, never their notes. The
 * group's thread and the user's own notes on it come with M13-08.
 */
function GroupLessonScreen() {
  const { groupId, lessonId } = Route.useParams();
  const lesson = useLiveQuery(async () => (await db.groupLesson.get(lessonId)) ?? null, [lessonId]);
  if (lesson === undefined) return <ScreenSkeleton />;
  if (lesson === null || lesson.groupId !== groupId) {
    return <NotFoundScreen>This lesson isn’t in the group any more.</NotFoundScreen>;
  }
  const details = [longDate(lesson.date), KIND_LABELS[lesson.kind], lesson.speaker, lesson.church];
  return (
    <div className="flex flex-col gap-4">
      <ScreenTitle>{lesson.title}</ScreenTitle>
      <p className="text-sm text-muted-foreground">{details.filter(Boolean).join(' · ')}</p>
      {lesson.mainPassages.length > 0 && (
        <p>{lesson.mainPassages.map((ref) => formatPassage(ref)).join('; ')}</p>
      )}
      <p className="text-sm text-muted-foreground">
        The group’s thread on this lesson comes in a later version.
      </p>
    </div>
  );
}
