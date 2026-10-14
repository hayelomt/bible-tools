import { Button, buttonVariants } from '@lamp/ui/components/button';
import { toast } from '@lamp/ui/components/sonner';
import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { setParked } from '@/data/actions/questions.ts';
import type { QuestionInQueue, TakeawayInQueue } from '@/data/review.ts';
import { shortDate } from '@/lib/dates.ts';
import { runWrite } from '@/lib/run-write.ts';

/** Open questions show this many at first; "Show all" lists the rest (decided 2026-10-14). */
export const QUESTIONS_SHOWN = 5;

const headingClass = 'text-xs font-medium tracking-wide text-muted-foreground uppercase';

/** `OPEN QUESTIONS · 3`, newest lesson first, each with Answer, Park and Open lesson. */
export function OpenQuestions({ questions }: { questions: QuestionInQueue[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? questions : questions.slice(0, QUESTIONS_SHOWN);
  return (
    <section aria-labelledby="open-questions" className="flex flex-col gap-2">
      <h2 id="open-questions" className={`flex min-h-9 items-center ${headingClass}`}>
        Open questions · {questions.length}
      </h2>
      <ul className="flex flex-col divide-y">
        {shown.map((entry) => (
          <QuestionRow key={entry.question.id} entry={entry} />
        ))}
      </ul>
      {shown.length < questions.length && (
        <Button variant="ghost" className="self-start" onClick={() => setAll(true)}>
          Show all {questions.length}
        </Button>
      )}
    </section>
  );
}

function QuestionRow({ entry: { question, lesson } }: { entry: QuestionInQueue }) {
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

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0">
      <div>
        <p className="break-words">{question.text}</p>
        <p className="text-sm text-muted-foreground">
          {lesson.title} · {shortDate(lesson.date)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          to="/lessons/$lessonId"
          params={{ lessonId: lesson.id }}
          search={{ answer: question.id }}
          data-slot="button"
          aria-label={`Answer “${question.text}”`}
          className={buttonVariants({ size: 'sm', className: 'pointer-coarse:min-h-11' })}
        >
          Answer
        </Link>
        <Button
          variant="outline"
          size="sm"
          className="pointer-coarse:min-h-11"
          aria-label={`Park “${question.text}”`}
          onClick={park}
        >
          Park
        </Button>
        <Link
          to="/lessons/$lessonId"
          params={{ lessonId: lesson.id }}
          search={{ question: question.id }}
          data-slot="button"
          className={buttonVariants({
            variant: 'ghost',
            size: 'sm',
            className: 'pointer-coarse:min-h-11',
          })}
        >
          Open lesson
          <ChevronRight aria-hidden />
        </Link>
      </div>
    </li>
  );
}

/** `TAKEAWAYS · last 14 days`, newest first; each opens its lesson at the takeaway. */
export function RecentTakeaways({
  takeaways,
  days,
}: {
  takeaways: TakeawayInQueue[];
  days: number;
}) {
  return (
    <section aria-labelledby="recent-takeaways" className="flex flex-col gap-2">
      <h2 id="recent-takeaways" className={`flex min-h-9 items-center ${headingClass}`}>
        Takeaways · last {days} days
      </h2>
      <ul className="flex flex-col">
        {takeaways.map(({ takeaway, lesson }) => (
          <li key={takeaway.id}>
            <Link
              to="/lessons/$lessonId"
              params={{ lessonId: lesson.id }}
              search={{ takeaway: takeaway.id }}
              className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span aria-hidden className="self-start leading-6">
                •
              </span>
              <span className="min-w-0 flex-1">
                <span className="block leading-6 break-words">{takeaway.text}</span>
                <span className="block text-sm text-muted-foreground">
                  {lesson.title} · {shortDate(lesson.date)}
                </span>
              </span>
              <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
