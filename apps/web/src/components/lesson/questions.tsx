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
import { Link, useNavigate } from '@tanstack/react-router';
import { cn } from 'cn';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, EllipsisVertical, RefreshCw } from 'lucide-react';
import { type Ref, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { entryDate, entryToast, statusShown } from '@/components/questions/labels.ts';
import { QuestionPicker } from '@/components/questions/question-picker.tsx';
import {
  addQuestion,
  parkQuestion,
  removeFromLesson,
  removeQuestion,
  reopenQuestion,
  restoreEntries,
  restoreQuestion,
  revisitQuestion,
  updateQuestion,
} from '@/data/actions/questions.ts';
import { type LessonQuestion, lessonQuestions } from '@/data/queries.ts';
import { shortDate } from '@/lib/dates.ts';
import { count } from '@/lib/labels.ts';
import { runWrite } from '@/lib/run-write.ts';
import { useReveal } from '@/lib/use-reveal.ts';
import { PanelHeading } from './panel-heading.tsx';
import type { PanelApi } from './takeaways.tsx';

/** The panel's side of the lesson's + button: a new question, or one revisited here. */
export interface QuestionsApi extends PanelApi {
  revisit: () => void;
}

interface QuestionsProps {
  lessonId: string;
  ref?: Ref<QuestionsApi>;
  /** On a phone the list shows only once there's a question; the + button adds the first. */
  hideWhenEmpty?: boolean;
  /** A question to scroll to and highlight (a search result). */
  reveal?: string;
  /** "Answer in a section": the section list adds it and puts the cursor in it. */
  onAnswer: (questionId: string) => void;
  /** `›` on an answered question: the section list shows its answer. */
  onShowAnswer: (sectionId: string) => void;
}

/**
 * A lesson's open questions (F5, wireframes/lessons.md "Takeaways and questions"): open,
 * answered or parked. A question is answered in a section of the lesson, and turns answered as
 * soon as that section has text. A question from another lesson can be revisited here (F24): it
 * shows with ↻, and its thread has an entry in this lesson rather than a copy.
 */
export function Questions({
  lessonId,
  ref,
  hideWhenEmpty = false,
  reveal,
  onAnswer,
  onShowAnswer,
}: QuestionsProps) {
  const questions = useLiveQuery(() => lessonQuestions(lessonId), [lessonId]);
  const [adding, setAdding] = useState(false);
  const [revisiting, setRevisiting] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const headingId = useId();
  useImperativeHandle(
    ref,
    () => ({ add: () => setAdding(true), revisit: () => setRevisiting(true) }),
    [],
  );

  // Open questions from other lessons, not already here.
  const here = new Set(questions?.map((q) => q.id));
  const picker = (
    <QuestionPicker
      open={revisiting}
      onOpenChange={setRevisiting}
      title="Revisit a question"
      description="An open question from another lesson. It shows here too, and its thread notes that it came up again."
      submit="Revisit"
      offers={(c) => c.question.status === 'open' && !here.has(c.question.id)}
      empty="No open questions in other lessons."
      onPick={({ question }) => {
        setRevisiting(false);
        runWrite(revisitQuestion(question.id, lessonId), 'a question');
      }}
    />
  );

  if (!questions || (hideWhenEmpty && questions.length === 0 && !adding)) return picker;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      {picker}
      <PanelHeading
        id={headingId}
        add={{
          label: 'Add question',
          menu: [
            { label: 'New question', onClick: () => setAdding(true) },
            { label: 'Revisit a question…', onClick: () => setRevisiting(true) },
          ],
        }}
      >
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
                lessonId={lessonId}
                question={question}
                reveal={question.id === reveal}
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
  lessonId: string;
  question: LessonQuestion;
  reveal: boolean;
  onAnswer: () => void;
  onShowAnswer: (sectionId: string) => void;
  onEdit: () => void;
}

function QuestionRow({
  lessonId,
  question,
  reveal,
  onAnswer,
  onShowAnswer,
  onEdit,
}: QuestionRowProps) {
  const navigate = useNavigate();
  const { ref: revealRef, flash } = useReveal<HTMLLIElement>(reveal);
  const status = statusShown(question);
  const Icon = question.revisited ? RefreshCw : status.icon;
  const answer = question.status === 'answered' ? question.answerSectionId : null;

  /** The answer, here or in the lesson it was written in. */
  function showAnswer(sectionId: string) {
    if (!question.answerLessonId || question.answerLessonId === lessonId) {
      onShowAnswer(sectionId);
      return;
    }
    void navigate({
      to: '/lessons/$lessonId',
      params: { lessonId: question.answerLessonId },
      search: { section: sectionId },
    });
  }

  function park() {
    runWrite(
      parkQuestion(question.id).then((entry) => entryToast('Question parked.', entry.id)),
      'a question',
    );
  }

  function removeHere() {
    runWrite(
      removeFromLesson(question.id, lessonId).then((entries) =>
        toast('Question removed from this lesson.', {
          duration: 10_000,
          action: {
            label: 'Undo',
            onClick: () => runWrite(restoreEntries(entries), 'a question'),
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
      ref={revealRef}
      data-flash={flash || undefined}
      className={cn(
        '-mx-1 flex items-start gap-2 rounded-md px-1 py-1 transition-colors',
        question.status === 'parked' && 'text-muted-foreground',
        flash && 'bg-primary/10 ring-1 ring-primary',
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
        <span className="sr-only">
          {question.revisited ? `Revisited here, ${status.label.toLowerCase()}` : status.label}
          :{' '}
        </span>
        {question.text}
        {question.revisited && (
          <span className="block text-sm text-muted-foreground">
            first asked {firstAsked(question)} ·{' '}
            {count(question.entries.length, 'entry', 'entries')}
          </span>
        )}
      </span>
      {answer && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Go to answer"
          onClick={() => showAnswer(answer)}
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
            <DropdownMenuItem onClick={() => showAnswer(answer)}>Go to answer</DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={onAnswer}>Answer in a section</DropdownMenuItem>
          )}
          <DropdownMenuItem
            render={<Link to="/questions/$questionId" params={{ questionId: question.id }} />}
          >
            Thread
          </DropdownMenuItem>
          {question.status === 'open' && <DropdownMenuItem onClick={park}>Park</DropdownMenuItem>}
          {question.status === 'parked' && (
            <DropdownMenuItem onClick={() => runWrite(reopenQuestion(question.id), 'a question')}>
              Reopen
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
          <DropdownMenuSeparator />
          {question.revisited ? (
            <DropdownMenuItem variant="destructive" onClick={removeHere}>
              Remove from this lesson
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem variant="destructive" onClick={remove}>
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/** When the question was first asked: its first entry's day, "Sun 2 Mar". */
function firstAsked(question: LessonQuestion): string {
  const first = question.entries[0];
  return first ? entryDate(first.createdAt) : shortDate(question.createdAt.slice(0, 10));
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
