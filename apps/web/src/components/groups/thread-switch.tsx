import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Segmented } from '@/components/segmented.tsx';
import { type ThreadPlace, type ThreadQuestion, threadView } from '@/data/group-thread.ts';
import type { AnswerRequest } from './group-thread.tsx';

/** Which of a group lesson's threads shows (wireframes/sharing.md): the group's, or the user's own. */
export type ThreadMode = 'group' | 'mine';
const MODES = ['group', 'mine'] as const;
const LABELS: Record<ThreadMode, string> = { group: 'Group thread', mine: 'My notes' };

export const threadModeOf = (value: unknown): ThreadMode | undefined =>
  value === 'group' || value === 'mine' ? value : undefined;

/** The switch under a group lesson's details: "( Group thread | My notes )". */
export function ThreadSwitch({
  value,
  onChange,
}: {
  value: ThreadMode;
  onChange: (mode: ThreadMode) => void;
}) {
  return (
    <div className="mt-2">
      <Segmented name="thread" options={MODES} labels={LABELS} value={value} onChange={onChange} />
    </div>
  );
}

/**
 * A lesson's group thread as it stands, and its answers: `answer` adds one to the thread, and
 * `initialAnswer` (the queue's Answer) once, when the thread is read.
 */
export function useGroupThread(
  place: ThreadPlace | null | undefined,
  me: string | undefined,
  initialAnswer?: string,
) {
  const view = useLiveQuery(
    async () => (place && me ? threadView(place, me) : null),
    [place?.groupId, place?.groupLessonId, me],
  );
  const [request, setRequest] = useState<AnswerRequest>();
  const answer = (question: Pick<ThreadQuestion, 'id' | 'text'>, partial = false) =>
    setRequest((r) => ({
      questionId: question.id,
      text: question.text,
      partial,
      seq: (r?.seq ?? 0) + 1,
    }));
  // The queue's Answer is asked once, as soon as the thread has the question.
  const [asked, setAsked] = useState(false);
  const initial =
    !asked && initialAnswer ? view?.questions.find((q) => q.id === initialAnswer) : undefined;
  if (initial) {
    setAsked(true);
    answer(initial);
  }
  return { view, request, answer };
}
