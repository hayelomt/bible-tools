import {
  daysBetween,
  dueDate,
  type Grade,
  GRADES,
  isDue,
  type MemoryItem,
  nextInterval,
  translationLabel,
} from '@lamp/domain';
import { Button, buttonVariants } from '@lamp/ui/components/button';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { inDays, nextDueLine, progressLabel } from '@/components/memory/progress.ts';
import {
  afterGrade,
  position,
  type ReviewSession,
  startSession,
  withoutRemoved,
} from '@/components/memory/review-session.ts';
import { ScreenActions } from '@/components/shell/slots.tsx';
import { RefText } from '@/components/verses/verse-text.tsx';
import { gradeMemoryItem, memoryItems } from '@/data/actions/memory.ts';
import { useActiveTranslation } from '@/data/translation.ts';
import { today } from '@/lib/dates.ts';
import { runWrite } from '@/lib/run-write.ts';

interface MemorySearch {
  /** One verse, from its verse index row, due or not. Absent means every verse due today. */
  item?: string;
}

export const Route = createFileRoute('/_app/review/memory')({
  staticData: { title: 'Memory verses', back: '/review' },
  validateSearch: (search: Record<string, unknown>): MemorySearch => ({
    item: typeof search.item === 'string' && search.item ? search.item : undefined,
  }),
  component: MemoryReview,
});

const GRADE_LABELS: Record<Grade, string> = {
  again: 'Again',
  hard: 'Hard',
  good: 'Good',
  easy: 'Easy',
};

function MemoryReview() {
  const { item } = Route.useSearch();
  // A new run for each verse opened from the verse index.
  return <MemoryRun key={item ?? ''} only={item} />;
}

/**
 * The memory card (F10, wireframes/review.md "Memory card"): the reference, then the verse once
 * it's been said from memory, and four grades that set when it comes back (`domain/srs.ts`). Runs
 * through the verses due when it opened, or the one verse it was opened for.
 */
function MemoryRun({ only }: { only: string | undefined }) {
  // The run's day stays the one it started on, past midnight.
  const [day] = useState(today);
  const items = useLiveQuery(() => memoryItems(), []);
  const [started, setStarted] = useState<ReviewSession | null>(null);

  if (!items) return null;
  if (!started) {
    const ids = items
      .filter((item) => (only ? item.id === only : isDue(item, day)))
      .map((item) => item.id);
    setStarted(startSession(ids));
    return null;
  }

  const byId = new Map(items.map((item) => [item.id, item]));
  const session = withoutRemoved(started, new Set(byId.keys()));
  const current = session.queue[0] && byId.get(session.queue[0]);

  if (!current) {
    return <RunOver session={session} items={items} day={day} only={only} />;
  }
  const { at, of } = position(session);
  return (
    <>
      <ScreenActions>
        <span className="text-sm text-muted-foreground tabular-nums">
          {at} of {of}
        </span>
      </ScreenActions>
      <MemoryCard
        // A fresh, hidden card for each verse shown, the same one again too.
        key={`${current.id}:${session.done}`}
        item={current}
        onGrade={(grade) => {
          setStarted(afterGrade(session, grade));
          runWrite(gradeMemoryItem(current.id, grade, day), 'a memory verse');
        }}
      />
    </>
  );
}

function MemoryCard({ item, onGrade }: { item: MemoryItem; onGrade: (grade: Grade) => void }) {
  const [shown, setShown] = useState(false);
  const showButton = useRef<HTMLButtonElement>(null);
  const verse = useRef<HTMLDivElement>(null);
  const { ref } = item;
  const active = useActiveTranslation();

  // The next card takes focus from the grade just pressed; the verse takes it from "Show".
  useEffect(() => {
    (shown ? verse : showButton).current?.focus({ preventScroll: true });
  }, [shown]);

  // 1–4 grade from the keyboard once the verse shows.
  useEffect(() => {
    if (!shown) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      const grade = GRADES[Number(event.key) - 1];
      if (!grade) return;
      event.preventDefault();
      onGrade(grade);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shown, onGrade]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-medium">
        {ref.display} · {translationLabel(ref, active)}
      </p>
      <div
        ref={verse}
        tabIndex={-1}
        className="flex min-h-40 flex-col justify-center rounded-xl border bg-card p-5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {!shown ? (
          <p className="text-muted-foreground">Say it from memory, then show the verse.</p>
        ) : (
          <RefText
            verse={ref}
            className="text-[19px] leading-[1.6]"
            missing="Text not downloaded yet. It shows once the Bible is downloaded."
          />
        )}
      </div>
      {shown ? (
        <fieldset>
          <legend className="mb-2">How well did you know it?</legend>
          <div className="grid grid-cols-4 gap-2">
            {GRADES.map((grade, i) => {
              const days = nextInterval(item, grade);
              return (
                <button
                  key={grade}
                  type="button"
                  aria-label={`${GRADE_LABELS[grade]}, due ${days > 1 ? 'in ' : ''}${inDays(days)}`}
                  aria-keyshortcuts={String(i + 1)}
                  onClick={() => onGrade(grade)}
                  data-slot="button"
                  className={buttonVariants({
                    variant: grade === 'good' ? 'default' : 'outline',
                    className: 'h-auto flex-col gap-0 px-1 py-2',
                  })}
                >
                  {GRADE_LABELS[grade]}
                  <span className="text-xs font-normal opacity-75">{inDays(days)}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : (
        <Button ref={showButton} size="lg" className="w-full" onClick={() => setShown(true)}>
          Show the verse
        </Button>
      )}
      <p className="text-sm text-muted-foreground">{progressLabel(item)}</p>
    </div>
  );
}

/** The end of the run, or a run with nothing in it. */
function RunOver({
  session,
  items,
  day,
  only,
}: {
  session: ReviewSession;
  items: MemoryItem[];
  day: string;
  only: string | undefined;
}) {
  const due = items.some((item) => isDue(item, day));
  let heading: string;
  let line: string | null;
  if (session.done > 0) {
    heading = only ? 'Reviewed.' : 'Done for today.';
    line = nextLine(items, day, only);
  } else if (only) {
    heading = 'This memory verse was removed.';
    line = null;
  } else if (items.length === 0) {
    heading = 'No memory verses yet.';
    line = 'Choose Memorise on a verse in the reader or on a verse chip.';
  } else {
    heading = 'No verses due today.';
    line = nextDueLine(items, day);
  }

  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <p className="text-lg font-medium">{heading}</p>
      {line && <p className="text-muted-foreground">{line}</p>}
      <div className="flex flex-wrap justify-center gap-2">
        {due && (
          <Link
            to="/review/memory"
            search={{}}
            data-slot="button"
            className={buttonVariants({ className: 'pointer-coarse:min-h-11' })}
          >
            Review the verses due
          </Link>
        )}
        <Link
          to="/review"
          data-slot="button"
          className={buttonVariants({ variant: 'outline', className: 'pointer-coarse:min-h-11' })}
        >
          Back to Review
        </Link>
      </div>
    </div>
  );
}

/** After one verse: when it comes back. After a run: when the next verse is due. */
function nextLine(items: MemoryItem[], day: string, only: string | undefined): string | null {
  const item = only && items.find((i) => i.id === only);
  if (!item) return nextDueLine(items, day);
  const days = daysBetween(day, dueDate(item));
  return `${item.ref.display} comes back ${days > 1 ? 'in ' : ''}${inDays(days)}.`;
}
