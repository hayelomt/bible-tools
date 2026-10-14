import { isDue, type MemoryItem } from '@lamp/domain';
import { buttonVariants } from '@lamp/ui/components/button';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight } from 'lucide-react';
import { nextDueLine } from '@/components/memory/progress.ts';
import { OpenQuestions, RecentTakeaways } from '@/components/review/queue.tsx';
import { memoryItems } from '@/data/actions/memory.ts';
import { openQuestions, recentTakeaways } from '@/data/review.ts';
import { DEFAULT_REVIEW_WINDOW_DAYS } from '@/data/setup.ts';
import { useSettings } from '@/data/use-settings.ts';
import { today } from '@/lib/dates.ts';

export const Route = createFileRoute('/_app/review/')({
  staticData: { title: 'Review' },
  component: Review,
});

/**
 * The review queue (F9, wireframes/review.md "Review queue"): memory verses due today, open
 * questions, and the takeaways from the last `reviewWindowDays`. With nothing in it, "All caught
 * up."
 */
function Review() {
  const settings = useSettings();
  const ready = settings !== undefined;
  const days = settings?.reviewWindowDays ?? DEFAULT_REVIEW_WINDOW_DAYS;
  const day = today();
  const items = useLiveQuery(() => memoryItems(), []);
  const questions = useLiveQuery(() => openQuestions(), []);
  // Read once the settings are, so the window is the user's from the start.
  const takeaways = useLiveQuery(
    () => (ready ? recentTakeaways(day, days) : undefined),
    [ready, day, days],
  );
  if (!items || !questions || !takeaways) return null;

  const due = items.filter((item) => isDue(item, day));
  if (due.length === 0 && questions.length === 0 && takeaways.length === 0) {
    return <AllCaughtUp items={items} day={day} days={days} />;
  }
  return (
    <div className="flex flex-col gap-8">
      <MemoryVerses items={items} due={due} day={day} />
      {questions.length > 0 && <OpenQuestions questions={questions} />}
      {takeaways.length > 0 && <RecentTakeaways takeaways={takeaways} days={days} />}
    </div>
  );
}

function AllCaughtUp({ items, day, days }: { items: MemoryItem[]; day: string; days: number }) {
  const next = nextDueLine(items, day);
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <p className="text-lg font-medium">All caught up.</p>
      <p className="max-w-xs text-muted-foreground">
        No open questions and no verses due. Takeaways from the last {days} days show here too.
      </p>
      {next && <p className="text-muted-foreground">{next}</p>}
    </div>
  );
}

/** `MEMORY VERSES · 2 due [ Start › ]` and the references due. */
function MemoryVerses({
  items,
  due,
  day,
}: {
  items: MemoryItem[];
  due: MemoryItem[];
  day: string;
}) {
  return (
    <section aria-labelledby="memory-verses" className="flex flex-col gap-2">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <h2
          id="memory-verses"
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          Memory verses{due.length > 0 && ` · ${due.length} due`}
        </h2>
        {due.length > 0 && (
          <Link
            to="/review/memory"
            data-slot="button"
            className={buttonVariants({ className: 'pointer-coarse:min-h-11' })}
          >
            Start
            <ChevronRight aria-hidden />
          </Link>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground">
          None yet. Choose Memorise on a verse in the reader or on a verse chip.
        </p>
      ) : due.length > 0 ? (
        <p className="line-clamp-2">{due.map((item) => item.ref.display).join(' · ')}</p>
      ) : (
        <p className="text-muted-foreground">None due today. {nextDueLine(items, day)}</p>
      )}
    </section>
  );
}
