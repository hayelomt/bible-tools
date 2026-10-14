import { isDue } from '@lamp/domain';
import { buttonVariants } from '@lamp/ui/components/button';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight } from 'lucide-react';
import { nextDueLine } from '@/components/memory/progress.ts';
import { Placeholder } from '@/components/placeholder.tsx';
import { memoryItems } from '@/data/actions/memory.ts';
import { today } from '@/lib/dates.ts';

export const Route = createFileRoute('/_app/review/')({
  staticData: { title: 'Review' },
  component: Review,
});

/**
 * The review queue (wireframes/review.md "Review queue"). Its memory verses came first, with the
 * card (M6-02); open questions and takeaways join it in M6-03.
 */
function Review() {
  return (
    <div className="flex flex-col gap-8">
      <MemoryVerses />
      <Placeholder>Open questions and takeaways arrive in a later version.</Placeholder>
    </div>
  );
}

/** `MEMORY VERSES · 2 due [ Start › ]` and the references due. */
function MemoryVerses() {
  const items = useLiveQuery(() => memoryItems(), []);
  if (!items) return null;
  const day = today();
  const due = items.filter((item) => isDue(item, day));

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
