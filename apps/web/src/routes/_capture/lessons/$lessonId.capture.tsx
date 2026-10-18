import { createFileRoute } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { CaptureScreen } from '@/components/capture/capture-screen.tsx';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { lessonById } from '@/data/queries.ts';
import { useRecentLesson } from '@/lib/recent-lesson.ts';
import { useScreenReady } from '@/lib/screen-ready.ts';

export const Route = createFileRoute('/_capture/lessons/$lessonId/capture')({
  component: Capture,
});

function Capture() {
  const { lessonId } = Route.useParams();
  const lesson = useLiveQuery(() => lessonById(lessonId), [lessonId]);
  useScreenReady('capture', lesson !== undefined);
  // A share during the sermon offers this lesson (F18).
  useRecentLesson(lesson ? lessonId : null);

  if (lesson === undefined) return <ScreenSkeleton className="mx-auto max-w-2xl px-4 py-8" />;
  if (lesson === null) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <NotFoundScreen>
          This lesson doesn’t exist on this device. It may have been deleted, or not synced here
          yet.
        </NotFoundScreen>
      </div>
    );
  }
  return <CaptureScreen key={lessonId} lesson={lesson} />;
}
