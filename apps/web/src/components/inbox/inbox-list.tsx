import {
  type InboxItem,
  type InboxOrigin,
  isAppTranslation,
  type TranslationId,
  translationLabel,
  type VerseRef,
} from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import { Dialog, DialogContent } from '@lamp/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@lamp/ui/components/dropdown-menu';
import { toast } from '@lamp/ui/components/sonner';
import { cn } from 'cn';
import { Link } from '@tanstack/react-router';
import { ChevronRight, Ellipsis } from 'lucide-react';
import { useState } from 'react';
import { AddToLesson, type AddChoice, LessonPicker } from '@/components/reader/add-to-lesson.tsx';
import {
  appendToSection,
  dismissInboxItem,
  type ImportGroup,
  type InboxEntry,
  inboxItemTitle,
  type Placement,
  restoreInboxItem,
  sendToLesson,
  undoPlacement,
} from '@/data/actions/inbox.ts';
import { snapshotText, useBook } from '@/data/bible.ts';
import { receivedLabel, shortDate, today } from '@/lib/dates.ts';
import { count } from '@/lib/labels.ts';
import { runWrite } from '@/lib/run-write.ts';
import { AppendDialog } from './append-dialog.tsx';

/** How the item arrived, in the words of wireframes/interop.md. */
const ORIGIN_WORDS: Record<InboxOrigin, string> = {
  share: 'Shared',
  paste: 'Pasted',
  typed: 'Added',
  import: 'Imported',
  capture: 'Captured',
};

/**
 * The inbox's items, newest first (F17, wireframes/interop.md "Inbox"), an import as one row that
 * opens its items (M9-12).
 */
export function InboxList({ entries, fresh }: { entries: InboxEntry[]; fresh?: string | null }) {
  return (
    <ul className="flex flex-col divide-y" aria-label="Waiting">
      {entries.map((entry) =>
        entry.kind === 'item' ? (
          <li key={entry.item.id} className="py-3 first:pt-0">
            <InboxRow item={entry.item} fresh={entry.item.id === fresh} />
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

function InboxRow({ item, fresh }: { item: InboxItem; fresh: boolean }) {
  const [dialog, setDialog] = useState<'send' | 'append' | null>(null);
  const close = (open: boolean) => !open && setDialog(null);
  const label = inboxItemTitle(item);

  function send(choice: AddChoice) {
    setDialog(null);
    const target = choice === 'new' ? { newLesson: { date: today() } } : choice;
    runWrite(sendToLesson(item.id, target).then(placed), 'an inbox item');
  }

  function append(sectionId: string) {
    setDialog(null);
    runWrite(appendToSection(item.id, sectionId).then(placed), 'an inbox item');
  }

  function dismiss() {
    runWrite(
      dismissInboxItem(item.id).then(() => {
        toast('Dismissed.', {
          duration: 10_000,
          action: {
            label: 'Undo',
            onClick: () => runWrite(restoreInboxItem(item.id), 'an inbox item'),
          },
        });
      }),
      'an inbox item',
    );
  }

  return (
    <article
      aria-label={label}
      data-fresh={fresh || undefined}
      className={cn(
        'group/item -mx-2 flex flex-col gap-1.5 rounded-lg px-2 py-1 transition-colors duration-1000',
        fresh && 'bg-muted',
      )}
    >
      {item.ref && <ChipLine verse={item.ref} />}
      {item.text && <p className="line-clamp-4 break-words whitespace-pre-line">{item.text}</p>}
      <p className="text-sm text-muted-foreground">
        {[ORIGIN_WORDS[item.origin], sourceHost(item.sourceUrl), receivedLabel(item.receivedAt)]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <div className="flex items-center justify-between gap-2 pointer-fine:opacity-0 pointer-fine:group-focus-within/item:opacity-100 pointer-fine:group-hover/item:opacity-100 pointer-fine:has-aria-expanded:opacity-100">
        <Button variant="outline" size="sm" onClick={() => setDialog('send')}>
          Send to lesson
        </Button>
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
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => setDialog('append')}>
              Append to a section…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={dismiss}>Dismiss</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <SendDialog item={item} open={dialog === 'send'} onOpenChange={close} onSend={send} />
      <AppendDialog open={dialog === 'append'} onOpenChange={close} onAppend={append} />
    </article>
  );
}

/** "Sent to The Good Shepherd. [ Undo ]" */
function placed(placement: Placement) {
  const verb = placement.kind === 'section' ? 'Sent to' : 'Added to';
  toast(`${verb} ${placement.lesson.title}.`, {
    duration: 10_000,
    action: {
      label: 'Undo',
      onClick: () => runWrite(undoPlacement(placement), 'an inbox item'),
    },
  });
}

/** Send to lesson: the reader's Add to lesson, for a verse; for a note, the same with its words. */
function SendDialog({
  item,
  open,
  onOpenChange,
  onSend,
}: {
  item: InboxItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (choice: AddChoice) => void;
}) {
  const label = inboxItemTitle(item);
  if (item.ref) {
    return <AddToLesson open={open} onOpenChange={onOpenChange} label={label} onAdd={onSend} />;
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <LessonPicker
            title="Send to a lesson"
            description="Adds a section with the note at the end of the lesson."
            newLesson={label}
            submit="Send"
            onPick={onSend}
          />
        )}
      </DialogContent>
    </Dialog>
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
