import { createFileRoute } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { QuestionThreadView } from '@/components/questions/thread.tsx';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { ScreenTitle } from '@/components/shell/slots.tsx';
import { questionThread } from '@/data/question-thread.ts';

export const Route = createFileRoute('/_app/questions/$questionId')({
  staticData: { back: '/review' },
  component: QuestionScreen,
});

/** A question's thread (F24, wireframes/thinking.md "Question thread"). */
function QuestionScreen() {
  const { questionId } = Route.useParams();
  const thread = useLiveQuery(() => questionThread(questionId), [questionId]);
  if (thread === undefined) return <ScreenSkeleton />;
  if (thread === null) {
    return (
      <>
        <ScreenTitle>Question not found</ScreenTitle>
        <NotFoundScreen>
          This question doesn’t exist on this device. It may have been deleted or merged into
          another, or not synced here yet.
        </NotFoundScreen>
      </>
    );
  }
  return <QuestionThreadView thread={thread} />;
}
