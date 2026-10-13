import type { Question } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@lamp/ui/components/dropdown-menu';
import { Input } from '@lamp/ui/components/input';
import { toast } from '@lamp/ui/components/sonner';
import { cn } from 'cn';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Circle, CircleCheck, CirclePause, EllipsisVertical } from 'lucide-react';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import {
  addQuestion,
  removeQuestion,
  restoreQuestion,
  setParked,
  updateQuestion,
} from '@/data/actions/questions.ts';
import { lessonQuestions } from '@/data/queries.ts';
import { runWrite } from '@/lib/run-write.ts';
import { PanelHeading } from './panel-heading.tsx';

/** Colour is never the only signal (UX-PATTERNS): each status has an icon and a name. */
const STATUS = {
  open: { icon: Circle, label: 'Open' },
  answered: { icon: CircleCheck, label: 'Answered' },
  parked: { icon: CirclePause, label: 'Parked' },
} as const;

interface QuestionsProps {
  lessonId: string;
  /** "Answer in a section": the section list adds it and puts the cursor in it. */
  onAnswer: (questionId: string) => void;
  /** `›` on an answered question: the section list shows its answer. */
  onShowAnswer: (sectionId: string) => void;
}

/**
 * A lesson's open questions (F5, wireframes/lessons.md "Takeaways and questions"): open,
 * answered or parked. A question is answered in a section of the lesson, and turns answered as
 * soon as that section has text.
 */
export function Questions({ lessonId, onAnswer, onShowAnswer }: QuestionsProps) {
  const questions = useLiveQuery(() => lessonQuestions(lessonId), [lessonId]);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const headingId = useId();

  if (!questions) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <PanelHeading id={headingId} add={{ label: 'Add question', onClick: () => setAdding(true) }}>
        Questions
      </PanelHeading>
      {questions.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">
          Nothing yet. A question is something to follow up on later.
        </p>
      )}
      {questions.length > 0 && (
        <ul className="flex flex-col">
          {questions.map((question) =>
            editing === question.id ? (
              <li key={question.id}>
                <QuestionField
                  label="Edit question"
                  initial={question.text}
                  onSubmit={(text) => {
                    if (text !== question.text) {
                      runWrite(updateQuestion(question.id, text), 'a question');
                    }
                    setEditing(null);
                  }}
                  onClose={() => setEditing(null)}
                />
              </li>
            ) : (
              <QuestionRow
                key={question.id}
                question={question}
                onAnswer={() => onAnswer(question.id)}
                onShowAnswer={onShowAnswer}
                onEdit={() => setEditing(question.id)}
              />
            ),
          )}
        </ul>
      )}
      {adding && (
        <QuestionField
          label="New question"
          initial=""
          keepOpen
          onSubmit={(text) => runWrite(addQuestion(lessonId, text), 'a question')}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
  );
}

interface QuestionRowProps {
  question: Question;
  onAnswer: () => void;
  onShowAnswer: (sectionId: string) => void;
  onEdit: () => void;
}

function QuestionRow({ question, onAnswer, onShowAnswer, onEdit }: QuestionRowProps) {
  const { icon: Icon, label } = STATUS[question.status];
  const answer = question.status === 'answered' ? question.answerSectionId : null;

  function park() {
    runWrite(
      setParked(question.id, true).then(() =>
        toast('Question parked.', {
          duration: 10_000,
          action: {
            label: 'Undo',
            onClick: () => runWrite(setParked(question.id, false), 'a question'),
          },
        }),
      ),
      'a question',
    );
  }

  function remove() {
    runWrite(
      removeQuestion(question.id).then(() =>
        toast('Question deleted.', {
          duration: 10_000,
          action: {
            label: 'Undo',
            onClick: () => runWrite(restoreQuestion(question.id), 'a question'),
          },
        }),
      ),
      'a question',
    );
  }

  return (
    <li
      className={cn(
        'flex items-start gap-2 py-1',
        question.status === 'parked' && 'text-muted-foreground',
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          'mt-1 size-4 shrink-0',
          question.status === 'answered' ? 'text-primary' : 'text-muted-foreground',
        )}
      />
      <span className="min-w-0 flex-1 py-0.5 leading-6 break-words">
        <span className="sr-only">{label}: </span>
        {question.text}
      </span>
      {answer && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Go to answer"
          onClick={() => onShowAnswer(answer)}
        >
          <ChevronRight />
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="Question actions" />}
        >
          <EllipsisVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {answer ? (
            <DropdownMenuItem onClick={() => onShowAnswer(answer)}>Go to answer</DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={onAnswer}>Answer in a section</DropdownMenuItem>
          )}
          {question.status === 'open' && <DropdownMenuItem onClick={park}>Park</DropdownMenuItem>}
          {question.status === 'parked' && (
            <DropdownMenuItem onClick={() => runWrite(setParked(question.id, false), 'a question')}>
              Reopen
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={remove}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

interface QuestionFieldProps {
  label: string;
  initial: string;
  /** Adding: Enter adds the question and leaves the field open for the next one. */
  keepOpen?: boolean;
  onSubmit: (text: string) => void;
  onClose: () => void;
}

/** The field a question is typed or edited in. Enter stores it, Escape leaves it as it was. */
function QuestionField({
  label,
  initial,
  keepOpen = false,
  onSubmit,
  onClose,
}: QuestionFieldProps) {
  const [text, setText] = useState(initial);
  const field = useRef<HTMLInputElement>(null);
  // Escape or Enter already settled it; the blur that follows must not submit again.
  const settled = useRef(false);

  useLayoutEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);

  function submit() {
    const value = text.trim();
    if (value) onSubmit(value);
    if (keepOpen && value) {
      setText('');
    } else {
      settled.current = true;
      onClose();
    }
  }

  return (
    <Input
      ref={field}
      value={text}
      maxLength={2000}
      aria-label={label}
      placeholder="Ask a question"
      autoComplete="off"
      className="my-1"
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          settled.current = true;
          onClose();
        }
      }}
      // Leaving the field keeps what was typed.
      onBlur={() => {
        if (settled.current) return;
        settled.current = true;
        const value = text.trim();
        if (value) onSubmit(value);
        onClose();
      }}
    />
  );
}
