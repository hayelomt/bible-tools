import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { ChevronRight } from 'lucide-react';
import { shortDate } from '@/lib/dates.ts';
import type { VerseIndexEntry } from '@/search/results.ts';
import { around } from '@/search/snippet.ts';

/**
 * The verse index's rows (F7, wireframes/verses.md "Verse index"), newest first: what cites the
 * passage, when and in which lesson, and the text around the citation. A section opens its lesson
 * scrolled to it; a lesson's main passage opens the lesson.
 */
export function VerseIndexList({ entries }: { entries: VerseIndexEntry[] }) {
  return (
    <ul className="flex flex-col divide-y">
      {entries.map((entry) => (
        <li key={entry.id} className="py-1 first:pt-0">
          <Link
            to="/lessons/$lessonId"
            params={{ lessonId: entry.lesson.id }}
            search={entry.kind === 'section' ? { section: entry.id } : {}}
            className="-mx-2 flex items-start gap-3 rounded-lg px-2 py-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {entry.kind === 'section' ? 'Note' : 'Lesson'} · {shortDate(entry.lesson.date)}
              </span>
              <span className="font-medium break-words">{entry.lesson.title}</span>
              <EntryText entry={entry} />
            </span>
            <ChevronRight aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function EntryText({ entry }: { entry: VerseIndexEntry }) {
  const passages = entry.passages ?? [];
  if (entry.kind === 'lesson') {
    return <span className="text-muted-foreground">Main passage: {passages.join(', ')}</span>;
  }
  return (
    <span
      className={cn(
        'line-clamp-3 font-serif break-words',
        entry.reply && 'border-l-2 border-border pl-3',
      )}
    >
      {around(entry.text, passages).map((segment, i) =>
        segment.match ? (
          // oxlint-disable-next-line react/no-array-index-key -- runs of one string never move
          <strong key={i} className="font-sans text-[0.9em] font-semibold">
            {segment.text}
          </strong>
        ) : (
          segment.text
        ),
      )}
    </span>
  );
}
