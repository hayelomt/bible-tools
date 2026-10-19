import { passageSlug, type VerseRef } from '@lamp/domain';
import { Button, buttonVariants } from '@lamp/ui/components/button';
import { toast } from '@lamp/ui/components/sonner';
import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, CircleDot, XIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { PassageInput } from '@/components/passage-input.tsx';
import {
  clearPrep,
  type PrepSummary,
  prepOf,
  restorePrep,
  startPrep,
} from '@/data/actions/prep.ts';
import { shortDate } from '@/lib/dates.ts';
import { count } from '@/lib/labels.ts';
import { runWrite } from '@/lib/run-write.ts';
import { useToday } from '@/lib/use-today.ts';

const ROW_LINK =
  '-mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11';

const UNDO_MS = 10_000;

/**
 * The prep card on the lessons home (F29, M11-09, wireframes/sermon.md "Prep card"): one muted line
 * until the coming sermon's passage is entered, then what Lamp already has on it and Start capture.
 * Read from the device, so it has no loading state; it shows nothing until the first read.
 */
export function PrepCard() {
  const day = useToday();
  const prep = useLiveQuery(() => prepOf(day), [day]);
  if (prep === undefined) return null;
  return prep ? <PrepSummaryCard prep={prep} /> : <PrepEntry day={day} />;
}

/** `Prep the next sermon ›`, which opens the passage field. */
function PrepEntry({ day }: { day: string }) {
  const [open, setOpen] = useState(false);
  const fieldId = useId();
  // Opened to type: the field has focus, so the keyboard comes up.
  useEffect(() => {
    if (open) document.getElementById(fieldId)?.focus();
  }, [open, fieldId]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-mt-6 flex items-center gap-1 self-start rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
      >
        Prep the next sermon
        <ChevronRight aria-hidden className="size-4" />
      </button>
    );
  }

  const start = (passage: VerseRef) => {
    setOpen(false);
    runWrite(startPrep(passage, day), 'the prep');
  };

  return (
    <div className="-mt-4 flex flex-col gap-2 rounded-xl border p-4">
      <label htmlFor={fieldId} className="text-sm font-medium">
        The next sermon’s passage
      </label>
      <PassageInput
        id={fieldId}
        value={[]}
        onChange={(next) => {
          const passage = next[0];
          if (passage) start(passage);
        }}
      />
      <Button variant="ghost" size="sm" className="self-start" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}

/** The card itself, once the passage is in. */
function PrepSummaryCard({ prep }: { prep: PrepSummary }) {
  const { lesson, passage } = prep;
  const [showQuestions, setShowQuestions] = useState(false);
  const questionsId = useId();
  const headingId = useId();
  const empty = prep.sections === 0 && prep.questions.length === 0 && prep.tags.length === 0;

  const clear = async () => {
    const cleared = await clearPrep(lesson.id);
    toast('Prep cleared.', {
      duration: UNDO_MS,
      action: { label: 'Undo', onClick: () => runWrite(restorePrep(cleared), 'the prep') },
    });
  };

  return (
    <section
      aria-labelledby={headingId}
      className="-mt-4 flex flex-col gap-2 rounded-xl border p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2
          id={headingId}
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          Next sermon · {shortDate(lesson.date)}
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Clear the prep"
          className="-my-1 pointer-coarse:size-11"
          onClick={() => runWrite(clear(), 'the prep')}
        >
          <XIcon />
        </Button>
      </div>
      <Link
        to="/lessons/$lessonId"
        params={{ lessonId: lesson.id }}
        className="self-start rounded-md text-lg font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {passage.display}
      </Link>

      {empty ? (
        <p className="text-muted-foreground">
          Nothing on {passage.display} yet. You’ll start fresh.
        </p>
      ) : (
        <div className="flex flex-col">
          {prep.sections > 0 && (
            <Link
              to="/compile/$passage"
              params={{ passage: passageSlug(passage) }}
              className={ROW_LINK}
            >
              <span className="flex-1">
                {count(prep.sections, 'section')} in {count(prep.lessons, 'lesson')}
              </span>
              <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
            </Link>
          )}
          {prep.questions.length > 0 && (
            <>
              <button
                type="button"
                aria-expanded={showQuestions}
                aria-controls={questionsId}
                onClick={() => setShowQuestions((shown) => !shown)}
                className={`${ROW_LINK} text-left`}
              >
                <span className="flex-1">{count(prep.questions.length, 'open question')}</span>
                <ChevronRight
                  aria-hidden
                  className={`size-4 text-muted-foreground transition-transform ${showQuestions ? 'rotate-90' : ''}`}
                />
              </button>
              {showQuestions && (
                <ul id={questionsId} className="flex flex-col pl-3">
                  {prep.questions.map((question) => (
                    <li key={question.id}>
                      <Link
                        to="/questions/$questionId"
                        params={{ questionId: question.id }}
                        className={`${ROW_LINK} text-sm`}
                      >
                        <span className="line-clamp-2 flex-1 break-words">{question.text}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {prep.tags.length > 0 && (
            <ul aria-label="Tags on it" className="flex flex-wrap gap-x-3 py-1.5 text-sm">
              {prep.tags.map((tag) => (
                <li key={tag.id}>
                  <Link
                    to="/tags/$tagId"
                    params={{ tagId: tag.id }}
                    className="rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
                  >
                    #{tag.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {prep.last && (
        <Link
          to="/lessons/$lessonId"
          params={{ lessonId: prep.last.lesson.id }}
          className={ROW_LINK}
        >
          <span className="min-w-0 flex-1 break-words">
            Last in {prep.last.series.title}: {prep.last.lesson.title} ·{' '}
            {shortDate(prep.last.lesson.date)}
          </span>
          <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      )}

      <Link
        to="/lessons/$lessonId/capture"
        params={{ lessonId: lesson.id }}
        data-slot="button"
        className={buttonVariants({ className: 'mt-1 gap-1.5 self-start' })}
      >
        <CircleDot aria-hidden />
        Start capture
      </Link>
    </section>
  );
}
