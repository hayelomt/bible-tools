import type { InboxItem } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@lamp/ui/components/dialog';
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@lamp/ui/components/dropdown-menu';
import { Input } from '@lamp/ui/components/input';
import { Label } from '@lamp/ui/components/label';
import { Textarea } from '@lamp/ui/components/textarea';
import { useId, useState } from 'react';
import { AddToLesson, type AddChoice, LessonPicker } from '@/components/reader/add-to-lesson.tsx';
import { TagInput } from '@/components/tags/tag-input.tsx';
import { inboxItemTitle, type Promoted, promoteText } from '@/data/actions/inbox.ts';
import { shortDate } from '@/lib/dates.ts';
import { count } from '@/lib/labels.ts';
import { useToday } from '@/lib/use-today.ts';
import { addDays, snoozeChoices } from './triage.ts';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Send to lesson: the reader's Add to lesson for one verse; for a note, or several items, the
 * same with their words. A new lesson is titled from the first item.
 */
export function SendDialog({
  items,
  open,
  onOpenChange,
  onSend,
}: DialogProps & { items: readonly InboxItem[]; onSend: (choice: AddChoice) => void }) {
  const first = items[0];
  if (!first) return null;
  const label = inboxItemTitle(first);
  if (items.length === 1 && first.ref) {
    return <AddToLesson open={open} onOpenChange={onOpenChange} label={label} onAdd={onSend} />;
  }
  const several = items.length > 1;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <LessonPicker
            title={several ? `Send ${count(items.length, 'item')} to a lesson` : 'Send to a lesson'}
            description={
              several
                ? 'Each becomes a section at the end of the lesson, in the order received.'
                : 'Adds a section with the note at the end of the lesson.'
            }
            newLesson={label}
            submit="Send"
            onPick={onSend}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Make a takeaway or a question (M11-03): the text in a field to edit first, then the lesson. The
 * item goes into the lesson too, so its chip stays with it.
 */
export function PromoteDialog({
  item,
  as,
  open,
  onOpenChange,
  onPromote,
}: DialogProps & {
  item: InboxItem;
  as: Promoted['kind'];
  onPromote: (choice: AddChoice, text: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && <PromoteForm item={item} as={as} onPromote={onPromote} />}
      </DialogContent>
    </Dialog>
  );
}

function PromoteForm({
  item,
  as,
  onPromote,
}: {
  item: InboxItem;
  as: Promoted['kind'];
  onPromote: (choice: AddChoice, text: string) => void;
}) {
  const [text, setText] = useState(() => promoteText(item));
  const id = useId();
  const noun = as === 'takeaway' ? 'takeaway' : 'question';
  const chip = item.ref ? ` ${item.ref.display} goes in as a section, so it stays with it.` : '';
  return (
    <LessonPicker
      title={`Make a ${noun}`}
      description={`Adds the ${noun} to the lesson you pick.${chip}`}
      newLesson={inboxItemTitle(item)}
      submit={as === 'takeaway' ? 'Add takeaway' : 'Add question'}
      disabled={!text.trim()}
      onPick={(choice) => onPromote(choice, text.replace(/\s+/g, ' ').trim())}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>{as === 'takeaway' ? 'Takeaway' : 'Question'}</Label>
        <Textarea
          id={id}
          value={text}
          maxLength={2000}
          rows={3}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
    </LessonPicker>
  );
}

/**
 * Tag: for one item, its tags with the tag input (as on a section); for several, a tag picked by
 * name goes on each.
 */
export function TagDialog({
  items,
  open,
  onOpenChange,
  onTag,
}: DialogProps & { items: readonly InboxItem[]; onTag: (name: string) => void }) {
  const id = useId();
  const one = items.length === 1 ? items[0] : undefined;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{one ? 'Tags' : `Tag ${count(items.length, 'item')}`}</DialogTitle>
          <DialogDescription>
            When {one ? 'it goes' : 'they go'} into a lesson, the tags go with {one ? 'it' : 'them'}
            .
          </DialogDescription>
        </DialogHeader>
        <label htmlFor={id} className="sr-only">
          Tag
        </label>
        {open &&
          (one ? (
            <TagInput id={id} target={{ kind: 'inboxItem', id: one.id }} focusOnMount />
          ) : (
            <TagInput
              id={id}
              target={{
                onPick: (name) => {
                  onTag(name);
                  onOpenChange(false);
                },
              }}
              focusOnMount
            />
          ))}
        {one && (
          <DialogFooter>
            <DialogClose render={<Button />}>Done</DialogClose>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Snooze's choices as a submenu: Tomorrow · Sunday · In a week · Pick a date. */
export function SnoozeMenu({
  onSnooze,
  onPickDate,
}: {
  onSnooze: (until: string) => void;
  onPickDate: () => void;
}) {
  const day = useToday();
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>Snooze</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-52">
        {snoozeChoices(day).map(({ label, until }) => (
          <DropdownMenuItem key={label} onClick={() => onSnooze(until)}>
            <span className="flex-1">{label}</span>
            <span className="text-xs text-muted-foreground">{shortDate(until)}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onClick={onPickDate}>Pick a date…</DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/** Snooze → Pick a date: any day from tomorrow. */
export function SnoozeDateDialog({
  open,
  onOpenChange,
  onSnooze,
}: DialogProps & { onSnooze: (until: string) => void }) {
  const day = useToday();
  const id = useId();
  const tomorrow = addDays(day, 1);
  const [until, setUntil] = useState(tomorrow);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (until < tomorrow) return;
            onSnooze(until);
            onOpenChange(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>Snooze until</DialogTitle>
            <DialogDescription>
              It’s out of the inbox until then, on every device.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor={id}>Day</Label>
            <Input
              id={id}
              type="date"
              min={tomorrow}
              value={until}
              required
              onChange={(event) => setUntil(event.target.value)}
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="submit" disabled={!until || until < tomorrow}>
              Snooze
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Make a lesson from the selected items: a title (the first item's, to start with), and "3 items
 * become 3 sections, in the order received."
 */
export function MakeLessonDialog({
  items,
  open,
  onOpenChange,
  onMake,
}: DialogProps & { items: readonly InboxItem[]; onMake: (title: string) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <MakeLessonForm items={items} onMake={onMake} />}</DialogContent>
    </Dialog>
  );
}

function MakeLessonForm({
  items,
  onMake,
}: {
  items: readonly InboxItem[];
  onMake: (title: string) => void;
}) {
  // The first received, which becomes the first section.
  const first = items.toSorted((a, b) => a.receivedAt.localeCompare(b.receivedAt))[0];
  const [title, setTitle] = useState(() => (first ? inboxItemTitle(first) : ''));
  const id = useId();
  const n = items.length;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim()) onMake(title.trim());
      }}
    >
      <DialogHeader>
        <DialogTitle>Make a lesson</DialogTitle>
        <DialogDescription>
          {n === 1
            ? 'The item becomes its first section.'
            : `${count(n, 'item')} become ${count(n, 'section')}, in the order received.`}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>Title</Label>
        <Input
          id={id}
          value={title}
          maxLength={200}
          required
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={!title.trim()}>
          Make lesson
        </Button>
      </DialogFooter>
    </form>
  );
}
