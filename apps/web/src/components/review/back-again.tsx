import { daysBetween, formatPassage, passageSlug, type ResurfaceRule } from '@lamp/domain';
import { Button, buttonVariants } from '@lamp/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@lamp/ui/components/dropdown-menu';
import { toast } from '@lamp/ui/components/sonner';
import { Link } from '@tanstack/react-router';
import { ChevronRight, EllipsisVertical } from 'lucide-react';
import { useState } from 'react';
import { entryToast } from '@/components/questions/labels.ts';
import { parkQuestion } from '@/data/actions/questions.ts';
import { dismissResurfaced, undoDismissal } from '@/data/actions/resurface.ts';
import { lineageSummary } from '@/data/question-thread.ts';
import type {
  RepeatedVerseItem,
  ResurfacedItem,
  StaleQuestion,
  YearAgo,
} from '@/data/resurface.ts';
import { monthLabel, shortDate, shortDateWithYear } from '@/lib/dates.ts';
import { count } from '@/lib/labels.ts';
import { runWrite } from '@/lib/run-write.ts';

/** At most this many rows at first, a year ago first; "Show all" lists the rest. */
export const BACK_AGAIN_SHOWN = 5;

const headingClass = 'text-xs font-medium tracking-wide text-muted-foreground uppercase';
const rowLink =
  'rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50';

const MONTH_YEAR = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * `BACK AGAIN` (F30, wireframes/reflection.md "Resurfaced in Review"): old material the three
 * rules bring back. Quiet: it doesn't add to the tab's count, and isn't shown when empty.
 */
export function BackAgain({ items, today }: { items: ResurfacedItem[]; today: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, BACK_AGAIN_SHOWN);
  return (
    <section aria-labelledby="back-again" className="flex flex-col gap-2">
      <h2 id="back-again" className={`flex min-h-9 items-center ${headingClass}`}>
        Back again
      </h2>
      <ul className="flex flex-col divide-y">
        {shown.map((item) => (
          <li
            key={`${item.rule}:${item.targetKey}`}
            className="flex flex-col gap-2 py-3 first:pt-0"
          >
            {item.rule === 'year_ago' ? (
              <YearAgoRow item={item} today={today} />
            ) : item.rule === 'repeated_verse' ? (
              <RepeatedVerseRow item={item} today={today} />
            ) : (
              <StaleQuestionRow item={item} today={today} />
            )}
          </li>
        ))}
      </ul>
      {shown.length < items.length && (
        <Button variant="ghost" className="self-start" onClick={() => setAll(true)}>
          Show all {items.length}
        </Button>
      )}
    </section>
  );
}

/** The row's heading and its ⋮, with "Dismiss for a year". */
function RowHeading({
  label,
  rule,
  targetKey,
  name,
  today,
}: {
  label: string;
  rule: ResurfaceRule;
  targetKey: string;
  /** What the menu is for, to a screen reader. */
  name: string;
  today: string;
}) {
  function dismiss() {
    runWrite(
      dismissResurfaced(rule, targetKey, today).then((dismissal) =>
        toast(`Hidden until ${MONTH_YEAR.format(new Date(`${dismissal.until}T00:00:00Z`))}.`, {
          duration: 10_000,
          action: {
            label: 'Undo',
            onClick: () => runWrite(undoDismissal(dismissal.id), 'a dismissal'),
          },
        }),
      ),
      'a dismissal',
    );
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className={headingClass}>{label}</h3>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="-my-2 pointer-coarse:size-11"
              aria-label={`More for ${name}`}
            />
          }
        >
          <EllipsisVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={dismiss}>Dismiss for a year</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** `A YEAR AGO · Sun 26 Oct 2025`: the lesson, its passage and size, and its open questions. */
function YearAgoRow({ item, today }: { item: YearAgo; today: string }) {
  const { lesson, years, sections, questions } = item;
  const when = years === 1 ? 'A year ago' : `${years} years ago`;
  const details = [
    lesson.mainPassages[0] ? formatPassage(lesson.mainPassages[0]) : null,
    count(sections, 'section'),
  ].filter(Boolean);
  return (
    <>
      <RowHeading
        label={`${when} · ${shortDateWithYear(lesson.date)}`}
        rule="year_ago"
        targetKey={lesson.id}
        name={lesson.title}
        today={today}
      />
      <Link
        to="/lessons/$lessonId"
        params={{ lessonId: lesson.id }}
        className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="min-w-0 flex-1">
          <span className="block break-words">{lesson.title}</span>
          <span className="block text-sm text-muted-foreground">{details.join(' · ')}</span>
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </Link>
      {questions.length > 0 && (
        <ul aria-label={`Open questions in ${lesson.title}`} className="flex flex-col gap-1">
          {questions.map((question) => (
            <li key={question.id} className="text-sm break-words">
              <span aria-hidden>? </span>
              <Link
                to="/questions/$questionId"
                params={{ questionId: question.id }}
                className={rowLink}
              >
                {question.text}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** `REPEATED VERSE · Romans 8:28`: in how many lessons, and when it was last read as one. */
function RepeatedVerseRow({ item, today }: { item: RepeatedVerseItem; today: string }) {
  const display = formatPassage(item.passage);
  const read = item.lastVisit
    ? `not read as a commentary since ${monthLabel(item.lastVisit, new Date(`${today}T12:00:00`))}`
    : 'never read as a commentary';
  return (
    <>
      <RowHeading
        label={`Repeated verse · ${display}`}
        rule="repeated_verse"
        targetKey={item.targetKey}
        name={display}
        today={today}
      />
      <p>
        In {count(item.lessons, 'lesson')}; {read}.
      </p>
      <Link
        to="/compile/$passage"
        params={{ passage: passageSlug(item.passage) }}
        data-slot="button"
        className={buttonVariants({
          variant: 'outline',
          size: 'sm',
          className: 'self-start pointer-coarse:min-h-11',
        })}
      >
        Read as commentary
        <ChevronRight aria-hidden />
      </Link>
    </>
  );
}

/** "open 4 months", "open over a year". */
function openFor(since: string, today: string): string {
  const days = daysBetween(since, today);
  if (days >= 365) {
    const years = Math.floor(days / 365.25);
    return years <= 1 ? 'open over a year' : `open over ${years} years`;
  }
  return `open ${Math.round(days / 30.44)} months`;
}

/** `STALE QUESTION · open 4 months`: the question, its lineage, Answer, Park and Thread. */
function StaleQuestionRow({ item, today }: { item: StaleQuestion; today: string }) {
  const { question, lesson } = item;
  const summary = lineageSummary(question.entries);

  function park() {
    runWrite(
      parkQuestion(question.id).then((parked) => entryToast('Question parked.', parked.id)),
      'a question',
    );
  }

  return (
    <>
      <RowHeading
        label={`Stale question · ${openFor(item.since, today)}`}
        rule="stale_question"
        targetKey={question.id}
        name={`“${question.text}”`}
        today={today}
      />
      <div>
        <p className="break-words">
          <Link
            to="/questions/$questionId"
            params={{ questionId: question.id }}
            className={rowLink}
          >
            {question.text}
          </Link>
        </p>
        {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
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
          to="/questions/$questionId"
          params={{ questionId: question.id }}
          data-slot="button"
          aria-label={`Thread of “${question.text}”`}
          className={buttonVariants({
            variant: 'ghost',
            size: 'sm',
            className: 'pointer-coarse:min-h-11',
          })}
        >
          Thread
          <ChevronRight aria-hidden />
        </Link>
      </div>
    </>
  );
}
