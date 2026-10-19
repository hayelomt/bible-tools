import { Button } from '@lamp/ui/components/button';
import { Input } from '@lamp/ui/components/input';
import { Circle, CircleCheck, CircleDashed } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { PanelHeading } from '@/components/lesson/panel-heading.tsx';
import { askInGroup } from '@/data/actions/group-thread.ts';
import type { GroupQuestionStatus, ThreadPlace, ThreadQuestion } from '@/data/group-thread.ts';
import { shortDate } from '@/lib/dates.ts';
import { runWrite } from '@/lib/run-write.ts';
import { targetOf } from './group-thread.tsx';

const ICONS: Record<GroupQuestionStatus, typeof Circle> = {
  open: Circle,
  partial: CircleDashed,
  answered: CircleCheck,
};

/** "Partly answered by Ann", "Answered by Ann · Tue 14 Oct", or nothing for an open one. */
export function answeredLine(question: ThreadQuestion): string | null {
  const by = question.answeredBy.join(', ');
  if (question.status === 'partial') return `Partly answered by ${by}`;
  if (question.status === 'answered') {
    return `Answered by ${by}${question.answeredAt ? ` · ${shortDate(question.answeredAt.slice(0, 10))}` : ''}`;
  }
  return null;
}

/** A group question's status, as its icon says it. */
export function StatusIcon({ status }: { status: GroupQuestionStatus }) {
  const Icon = ICONS[status];
  const label = { open: 'Open', partial: 'Partly answered', answered: 'Answered' }[status];
  return (
    <span className="mt-0.5 shrink-0 text-muted-foreground" title={label}>
      <Icon className="size-4" aria-hidden />
      <span className="sr-only">{label}: </span>
    </span>
  );
}

/**
 * The lesson's questions in its group thread (wireframes/sharing.md "QUESTIONS · GROUP"): every
 * member's, with who asked, and Answer, which adds an answer to the thread. A question added here is
 * in the group's queue (M13-10).
 */
export function GroupQuestions({
  place,
  questions,
  onAnswer,
}: {
  place: ThreadPlace;
  questions: readonly ThreadQuestion[];
  onAnswer: (question: ThreadQuestion) => void;
}) {
  const headingId = useId();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  // Escape leaves without adding, though the field's blur follows it.
  const cancelled = useRef(false);
  const add = () => {
    if (text.trim() && !cancelled.current) {
      runWrite(askInGroup(targetOf(place), text.trim()), 'a question');
    }
    cancelled.current = false;
    setText('');
    setAdding(false);
  };
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <PanelHeading
        id={headingId}
        add={{ label: 'Add group question', onClick: () => setAdding(true) }}
      >
        Questions · group
      </PanelHeading>
      {questions.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">
          No questions in the group thread. A question added here, the group sees and can answer.
        </p>
      )}
      <ul className="flex flex-col">
        {questions.map((question) => {
          const answered = answeredLine(question);
          return (
            <li
              key={question.id}
              data-group-question={question.id}
              className="flex items-start gap-2 py-2"
            >
              <StatusIcon status={question.status} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="break-words">
                  {question.text}
                  <span className="text-muted-foreground"> · {question.author}</span>
                </p>
                {answered && <p className="text-sm text-muted-foreground">{answered}</p>}
              </div>
              <Button variant="outline" size="sm" onClick={() => onAnswer(question)}>
                Answer
              </Button>
            </li>
          );
        })}
      </ul>
      {adding && (
        <Input
          value={text}
          maxLength={2000}
          aria-label="New group question"
          placeholder="Ask the group…"
          // oxlint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          onChange={(event) => setText(event.target.value)}
          onBlur={add}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              cancelled.current = true;
              event.currentTarget.blur();
            }
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            add();
          }}
        />
      )}
    </section>
  );
}
