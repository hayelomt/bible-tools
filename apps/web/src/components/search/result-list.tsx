import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { shortDate } from '@/lib/dates.ts';
import type { ResultGroup, ResultItem } from '@/search/results.ts';
import { snippet } from '@/search/snippet.ts';

const ROW_LINK =
  '-mx-2 flex items-start gap-3 rounded-lg px-2 py-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50';

interface ResultListProps {
  groups: ResultGroup[];
  /** Rows shown per lesson before "+ N more in this lesson"; all of them when left out. */
  perLesson?: number;
  /** Called as a result is opened (search remembers the query). */
  onOpen?: () => void;
}

/**
 * Results grouped by lesson, newest lesson first (F6, wireframes/search.md), on the search
 * screen and on a tag page. Each row opens its lesson at that section, takeaway or question.
 */
export function ResultList({ groups, perLesson = Infinity, onOpen }: ResultListProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  return (
    <ul className="flex flex-col divide-y">
      {groups.map(({ lesson, items }) => {
        const all = expanded.has(lesson.id) || items.length <= perLesson;
        const shown = all ? items : items.slice(0, perLesson);
        return (
          <li key={lesson.id} className="flex flex-col gap-1 py-4 first:pt-0">
            <h2 className="text-xs font-medium tracking-wide break-words text-muted-foreground uppercase">
              {lesson.title} · {shortDate(lesson.date)}
            </h2>
            {shown.map((item) => (
              <ResultRow key={item.id} lessonId={lesson.id} item={item} onOpen={onOpen} />
            ))}
            {!all && (
              <button
                type="button"
                className="-mx-2 self-start rounded-lg px-2 py-1 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
                onClick={() => setExpanded((ids) => new Set(ids).add(lesson.id))}
              >
                + {items.length - perLesson} more in this lesson
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Where a result opens: its lesson, at the row. */
function target(item: ResultItem) {
  switch (item.kind) {
    case 'lesson':
      return {};
    case 'section':
      return { section: item.id };
    case 'takeaway':
      return { takeaway: item.id };
    case 'question':
      return { question: item.id };
  }
}

const KIND_LABEL = { takeaway: 'Takeaway', question: 'Question' } as const;

function ResultRow({
  lessonId,
  item,
  onOpen,
}: {
  lessonId: string;
  item: ResultItem;
  onOpen?: () => void;
}) {
  return (
    <Link
      to="/lessons/$lessonId"
      params={{ lessonId }}
      search={target(item)}
      className={ROW_LINK}
      onClick={onOpen}
    >
      <span
        className={cn(
          'line-clamp-3 min-w-0 flex-1 break-words whitespace-pre-line',
          item.kind === 'section' && item.reply && 'pl-4',
        )}
      >
        <RowText item={item} />
      </span>
      <ChevronRight aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function RowText({ item }: { item: ResultItem }) {
  if (item.kind === 'lesson') {
    if (item.passages?.length) {
      return (
        <span className="text-muted-foreground">Main passage: {item.passages.join(', ')}</span>
      );
    }
    if (item.terms) {
      return (
        <>
          <span className="text-muted-foreground">Title: </span>
          <Highlighted text={item.text} terms={item.terms} />
        </>
      );
    }
    return <span className="text-muted-foreground italic">The whole lesson is tagged.</span>;
  }

  const passages = item.kind === 'section' ? item.passages : undefined;
  return (
    <>
      {item.kind !== 'section' && (
        <span className="font-sans text-muted-foreground">{KIND_LABEL[item.kind]}: </span>
      )}
      {passages?.map((p) => (
        <span
          key={p}
          className="mr-1.5 inline-block rounded-md bg-muted px-1.5 font-sans text-sm font-medium"
        >
          {p}
        </span>
      ))}
      {item.terms ? (
        <Highlighted text={item.text} terms={item.terms} />
      ) : (
        item.text || <span className="text-muted-foreground italic">Empty note</span>
      )}
    </>
  );
}

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  return snippet(text, terms).map((segment, i) =>
    segment.match ? (
      // oxlint-disable-next-line react/no-array-index-key -- runs of one string never move
      <strong key={i} className="font-semibold">
        {segment.text}
      </strong>
    ) : (
      segment.text
    ),
  );
}
