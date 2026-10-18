import {
  type InboxItem,
  type InboxOrigin,
  isAppTranslation,
  type Tag,
  type TranslationId,
  translationLabel,
  type VerseRef,
} from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import { Checkbox } from '@lamp/ui/components/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@lamp/ui/components/dropdown-menu';
import { cn } from 'cn';
import { Link } from '@tanstack/react-router';
import { ChevronRight, Ellipsis } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useId } from 'react';
import {
  type ImportGroup,
  type InboxEntry,
  inboxItemTags,
  inboxItemTitle,
} from '@/data/actions/inbox.ts';
import { snapshotText, useBook } from '@/data/bible.ts';
import { receivedLabel, shortDate, today } from '@/lib/dates.ts';
import { count } from '@/lib/labels.ts';
import { useToday } from '@/lib/use-today.ts';
import { oldLabel } from './triage.ts';
import { SnoozeMenu } from './triage-dialogs.tsx';
import { useTriage } from './use-triage.tsx';

/** How the item arrived, in the words of wireframes/interop.md. */
const ORIGIN_WORDS: Record<InboxOrigin, string> = {
  share: 'Shared',
  paste: 'Pasted',
  typed: 'Added',
  import: 'Imported',
  capture: 'Captured',
};

/** Items picked for a bulk action (M11-02); null while not selecting. */
export interface Selection {
  ids: ReadonlySet<string>;
  toggle: (id: string) => void;
}

/**
 * The inbox's items, newest first (F17, wireframes/interop.md "Inbox"), an import as one row that
 * opens its items (M9-12). While selecting (M11-02), each item has a tick box and a tap ticks it;
 * an import's row still opens it.
 */
export function InboxList({
  entries,
  fresh,
  selection = null,
  onSelect,
}: {
  entries: InboxEntry[];
  fresh?: string | null;
  selection?: Selection | null;
  /** Holding an item (or a right click) starts selecting with it. */
  onSelect?: (id: string) => void;
}) {
  const day = useToday();
  const ids = entries.flatMap((entry) => (entry.kind === 'item' ? [entry.item.id] : []));
  const tags = useLiveQuery(() => inboxItemTags(ids), [ids.join()]);
  return (
    <ul className="flex flex-col divide-y" aria-label="Waiting">
      {entries.map((entry) =>
        entry.kind === 'item' ? (
          <li key={entry.item.id} className="py-3 first:pt-0">
            <InboxRow
              item={entry.item}
              tags={tags?.get(entry.item.id) ?? NO_TAGS}
              day={day}
              fresh={entry.item.id === fresh}
              selection={selection}
              onSelect={onSelect}
            />
          </li>
        ) : (
          <li key={entry.group.importId} className="py-3 first:pt-0">
            <ImportRow group={entry.group} />
          </li>
        ),
      )}
    </ul>
  );
}

const NO_TAGS: Tag[] = [];

/** The day an import ran, "Tue 14 Oct", today too: it names the import. */
export const importDay = (importedAt: string) => shortDate(today(new Date(importedAt)));

/** The heading of an import, on its row and its screen: "YouVersion import · Tue 14 Oct". */
export const importTitle = (importedAt: string) => `YouVersion import · ${importDay(importedAt)}`;

/** `YOUVERSION IMPORT · Tue 14 Oct` / `980 items ›` */
function ImportRow({ group }: { group: ImportGroup }) {
  return (
    <Link
      to="/inbox/import/$importId"
      params={{ importId: group.importId }}
      aria-label={`${importTitle(group.importedAt)}, ${count(group.count, 'item')}`}
      className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {importTitle(group.importedAt)}
        </span>
        <span>{count(group.count, 'item')}</span>
      </span>
      <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
    </Link>
  );
}

function InboxRow({
  item,
  tags,
  day,
  fresh,
  selection,
  onSelect,
}: {
  item: InboxItem;
  tags: Tag[];
  day: string;
  fresh: boolean;
  selection: Selection | null;
  onSelect?: (id: string) => void;
}) {
  const label = inboxItemTitle(item);
  const triage = useTriage([item]);
  const selected = selection?.ids.has(item.id) ?? false;
  const checkId = useId();
  const old = oldLabel(item, day);

  return (
    // While selecting, a tap on the item ticks it; the tick box is the way for the keyboard.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <article
      aria-label={label}
      data-fresh={fresh || undefined}
      data-selected={selected || undefined}
      onContextMenu={(event) => {
        // Not from a dialog of the item's, which React bubbles through here from its portal.
        if (!onSelect || selection || !event.currentTarget.contains(event.target as Node)) return;
        event.preventDefault();
        onSelect(item.id);
      }}
      onClick={(event) => {
        // While selecting, a tap anywhere on the item ticks it (the box handles its own).
        const target = event.target as HTMLElement;
        if (!selection || !event.currentTarget.contains(target)) return;
        if (target.closest('[data-slot="checkbox"]')) return;
        selection.toggle(item.id);
      }}
      className={cn(
        'group/item -mx-2 flex gap-3 rounded-lg px-2 py-1 transition-colors duration-1000',
        fresh && 'bg-muted',
        selection && 'cursor-pointer',
        selected && 'bg-muted duration-0',
      )}
    >
      {selection && (
        <Checkbox
          id={checkId}
          checked={selected}
          onCheckedChange={() => selection.toggle(item.id)}
          aria-label={`Select ${label}`}
          className="mt-1 pointer-coarse:size-5"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {item.ref && <ChipLine verse={item.ref} />}
        {item.text && <p className="line-clamp-4 break-words whitespace-pre-line">{item.text}</p>}
        {tags.length > 0 && (
          <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
            {tags.map((tag) => (
              <span key={tag.id}>#{tag.name}</span>
            ))}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {[
            ORIGIN_WORDS[item.origin],
            sourceHost(item.sourceUrl),
            receivedLabel(item.receivedAt),
            // Muted words, never the destructive colour (wireframes/sermon.md).
            old,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {!selection && (
          <div className="flex items-center justify-between gap-2 pointer-fine:opacity-0 pointer-fine:group-focus-within/item:opacity-100 pointer-fine:group-hover/item:opacity-100 pointer-fine:has-aria-expanded:opacity-100">
            <Button variant="outline" size="sm" onClick={() => triage.open('send')}>
              Send to lesson
            </Button>
            <ItemMenu label={label} triage={triage} />
          </div>
        )}
      </div>
      {triage.dialogs}
    </article>
  );
}

/**
 * An item's `⋯` (wireframes/sermon.md): Append to a section · Make a takeaway · Make a question ·
 * Tag · Snooze · Dismiss. Send to lesson is the button beside it.
 */
function ItemMenu({ label, triage }: { label: string; triage: ReturnType<typeof useTriage> }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={`More for ${label}`}
            className="pointer-coarse:size-11"
          />
        }
      >
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => triage.open('append')}>
          Append to a section…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => triage.open('takeaway')}>
          Make a takeaway…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => triage.open('question')}>
          Make a question…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => triage.open('tag')}>Tag…</DropdownMenuItem>
        <SnoozeMenu onSnooze={triage.snooze} onPickDate={() => triage.open('snooze-date')} />
        <DropdownMenuItem onClick={triage.dismiss}>Dismiss</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** `⟦Romans 8:28 · BSB⟧` and the verse's text: the snapshot, or the book's while it has none. */
export function ChipLine({ verse }: { verse: VerseRef }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="self-start" data-slot="verse-chip">
        {verse.display} · {translationLabel(verse)}
      </span>
      {verse.snapshotText ? (
        <p className="line-clamp-3 break-words">{verse.snapshotText}</p>
      ) : isAppTranslation(verse.translation) ? (
        <BookText verse={verse} translation={verse.translation} />
      ) : null}
    </div>
  );
}

function BookText({ verse, translation }: { verse: VerseRef; translation: TranslationId }) {
  const book = useBook(translation, verse.book);
  if (book.status === 'loading') return null;
  if (book.status === 'missing') {
    return <p className="text-sm text-muted-foreground">Text not downloaded yet.</p>;
  }
  return <p className="line-clamp-3 break-words">{snapshotText(book.text, verse, translation)}</p>;
}

/** "bible.com" from a shared address; nothing for none. */
function sourceHost(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
