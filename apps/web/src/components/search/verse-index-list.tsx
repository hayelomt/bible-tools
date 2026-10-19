import { type MemoryItem, passageSlug, type Passage, type VerseRef } from '@lamp/domain';
import { buttonVariants } from '@lamp/ui/components/button';
import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { ChevronRight, X } from 'lucide-react';
import { useReading } from '@/data/verse-text.ts';
import { shortDate, today } from '@/lib/dates.ts';
import type { VerseIndexEntry } from '@/search/results.ts';
import { around } from '@/search/snippet.ts';
import { forgetVerse } from '../memory/memorise.ts';
import { dueLabel, stageLabel } from '../memory/progress.ts';
import { HIGHLIGHT_COLOUR_NAME } from '../reader/colours.ts';

/**
 * The verse index's rows (F7, wireframes/verses.md "Verse index"), newest first: what cites the
 * passage, when, and the text around the citation. A section opens its lesson scrolled to it; a
 * lesson's main passage opens the lesson; a highlight opens the reader at its first verse; a memory
 * verse opens its memory card (M6-02) and can be removed there (M6-01).
 */
export function VerseIndexList({ entries }: { entries: VerseIndexEntry[] }) {
  return (
    <ul className="flex flex-col divide-y">
      {entries.map((entry) => (
        <li key={entry.id} className="py-1 first:pt-0">
          {entry.kind === 'highlight' ? (
            <HighlightRow entry={entry} />
          ) : entry.kind === 'memory' ? (
            <MemoryRow item={entry.item} />
          ) : (
            <NoteRow entry={entry} />
          )}
        </li>
      ))}
    </ul>
  );
}

function NoteRow({ entry }: { entry: Extract<VerseIndexEntry, { kind: 'lesson' | 'section' }> }) {
  return (
    <Link
      to="/lessons/$lessonId"
      params={{ lessonId: entry.lesson.id }}
      search={entry.kind === 'section' ? { section: entry.id } : {}}
      className={rowClass}
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
  );
}

/** The reader's address for a passage's first verse. */
function readerParams({ book, chapter, verseStart }: Passage) {
  return {
    chapter: passageSlug({ book, chapter, ...(verseStart != null ? { verseStart } : {}) }),
  };
}

/** " — " and the verse's text as it reads now (decision 97), once it's here. */
function TextAfter({ verse }: { verse: VerseRef }) {
  const { text } = useReading(verse);
  return text ? ` — ${text}` : null;
}

function HighlightRow({ entry }: { entry: Extract<VerseIndexEntry, { kind: 'highlight' }> }) {
  return (
    <Link to="/read/$chapter" params={readerParams(entry.ref)} className={rowClass}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Highlight · {shortDate(today(new Date(entry.createdAt)))} ·{' '}
          {HIGHLIGHT_COLOUR_NAME[entry.colour].toLowerCase()}
        </span>
        <span className="line-clamp-3 break-words">
          {entry.passages[0]}
          <TextAfter verse={entry.ref} />
        </span>
        {entry.note && (
          <span className="line-clamp-2 text-muted-foreground">Note: {entry.note}</span>
        )}
      </span>
      <ChevronRight aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

/**
 * `MEMORY · due in 3 days · learning · 4 reviews` and the verse, opening its memory card (M6-02),
 * and × to remove it with Undo.
 */
function MemoryRow({ item }: { item: MemoryItem }) {
  const { ref } = item;
  return (
    <div className="flex items-start gap-1">
      <Link to="/review/memory" search={{ item: item.id }} className={cn(rowClass, 'flex-1')}>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Memory · {dueLabel(item)} · {stageLabel(item)}
          </span>
          <span className="line-clamp-3 break-words">
            {ref.display}
            <TextAfter verse={ref} />
          </span>
        </span>
        <ChevronRight aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
      </Link>
      <button
        type="button"
        aria-label={`Remove ${ref.display} from memory verses`}
        onClick={() => forgetVerse(item)}
        data-slot="button"
        className={buttonVariants({
          variant: 'ghost',
          size: 'icon',
          className: 'mt-1 shrink-0 text-muted-foreground pointer-coarse:size-11',
        })}
      >
        <X />
      </button>
    </div>
  );
}

function EntryText({ entry }: { entry: Extract<VerseIndexEntry, { kind: 'lesson' | 'section' }> }) {
  const passages = entry.passages ?? [];
  if (entry.kind === 'lesson') {
    return <span className="text-muted-foreground">Main passage: {passages.join(', ')}</span>;
  }
  return (
    <span
      className={cn('line-clamp-3 break-words', entry.reply && 'border-l-2 border-border pl-3')}
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

const rowClass =
  '-mx-2 flex items-start gap-3 rounded-lg px-2 py-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50';
