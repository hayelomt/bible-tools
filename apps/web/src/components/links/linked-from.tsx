import { Button } from '@lamp/ui/components/button';
import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { PanelHeading } from '@/components/lesson/panel-heading.tsx';
import { type Backlink, firstWords, linkedFrom } from '@/data/links.ts';
import { shortDate } from '@/lib/dates.ts';

/**
 * "Linked from" (F23, M10-07, wireframes/thinking.md): the sections whose link chips point here.
 * Read from the link index, so it follows links as they're added or removed, on this device or
 * another after sync. Neither list shows when nothing links here.
 */

/** One linking section: its lesson and date, then its first words; it opens that section. */
function BacklinkRow({ backlink: { section, lesson } }: { backlink: Backlink }) {
  return (
    <li>
      <Link
        to="/lessons/$lessonId"
        params={{ lessonId: lesson.id }}
        search={{ section: section.id }}
        className="-mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent pointer-coarse:min-h-11"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">
            {lesson.title} · {shortDate(lesson.date)}
          </span>
          <span className="line-clamp-1 text-sm text-muted-foreground">{firstWords(section)}</span>
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

/**
 * Under a section, beside its tags: "Linked from 2", which opens the list under it. `children` is
 * the rest of the row (the tags).
 */
export function SectionLinkedFrom({
  sectionId,
  children,
}: {
  sectionId: string;
  children: ReactNode;
}) {
  const backlinks = useLiveQuery(() => linkedFrom({ kind: 'section', id: sectionId }), [sectionId]);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const count = backlinks?.length ?? 0;
  return (
    <>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        {count > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2 shrink-0 text-muted-foreground"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen(!open)}
          >
            Linked from {count}
          </Button>
        )}
      </div>
      {count > 0 && open && (
        <section
          id={listId}
          aria-label="Linked from"
          className="mt-1 mb-2 rounded-lg border px-3 py-2"
        >
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Linked from
          </h3>
          <ul className="flex flex-col">
            {backlinks!.map((backlink) => (
              <BacklinkRow key={backlink.section.id} backlink={backlink} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** At the end of a lesson, after Questions: links to the lesson and to any of its sections. */
export function LessonLinkedFrom({ lessonId }: { lessonId: string }) {
  const backlinks = useLiveQuery(() => linkedFrom({ kind: 'lesson', id: lessonId }), [lessonId]);
  const headingId = useId();
  if (!backlinks?.length) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <PanelHeading id={headingId}>Linked from · {backlinks.length}</PanelHeading>
      <ul className={cn('flex flex-col divide-y')}>
        {backlinks.map((backlink) => (
          <BacklinkRow key={backlink.section.id} backlink={backlink} />
        ))}
      </ul>
    </section>
  );
}
