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
import { Input } from '@lamp/ui/components/input';
import { Label } from '@lamp/ui/components/label';
import { useId, useState } from 'react';
import { Segmented } from '@/components/segmented.tsx';
import type { SplitPlan } from '@/data/actions/questions.ts';
import type { QuestionThread } from '@/data/question-thread.ts';
import { ENTRY_KINDS, entryDate } from './labels.ts';

interface SplitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  thread: QuestionThread;
  onSplit: (plan: SplitPlan) => void;
}

const SIDES = ['1', '2'] as const;
const SIDE_LABELS = { 1: '1', 2: '2' } as const;

/**
 * "Split…" (wireframes/thinking.md): the question's text in two fields, and each entry with
 * `( 1 | 2 )` for the question that keeps it. Nothing is lost or copied.
 */
export function SplitDialog({ open, onOpenChange, thread, onSplit }: SplitDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <SplitForm thread={thread} onSplit={onSplit} />}</DialogContent>
    </Dialog>
  );
}

function SplitForm({ thread, onSplit }: Pick<SplitDialogProps, 'thread' | 'onSplit'>) {
  const [text, setText] = useState(thread.question.text);
  const [newText, setNewText] = useState('');
  const [sides, setSides] = useState<ReadonlyMap<string, '1' | '2'>>(new Map());
  const ids = { first: useId(), second: useId(), entries: useId() };
  const ready = text.trim() !== '' && newText.trim() !== '';

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        onSplit({
          text: text.trim(),
          newText: newText.trim(),
          moving: [...sides].flatMap(([id, side]) => (side === '2' ? [id] : [])),
        });
      }}
    >
      <DialogHeader>
        <DialogTitle>Split this question</DialogTitle>
        <DialogDescription>
          Say which question keeps each entry. Entries keep their dates and lessons.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor={ids.first}>Question 1</Label>
        <Input
          id={ids.first}
          value={text}
          maxLength={2000}
          autoComplete="off"
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={ids.second}>Question 2</Label>
        <Input
          id={ids.second}
          value={newText}
          maxLength={2000}
          autoComplete="off"
          placeholder="The new question"
          onChange={(event) => setNewText(event.target.value)}
        />
      </div>
      <p id={ids.entries} className="-mb-3 text-sm font-medium">
        Entries
      </p>
      <ul aria-labelledby={ids.entries} className="flex max-h-[40svh] flex-col overflow-y-auto">
        {thread.entries.map(({ entry, lesson }) => {
          const label = `${ENTRY_KINDS[entry.kind].label} · ${entryDate(entry.createdAt)}`;
          return (
            <li key={entry.id} className="flex items-center gap-3 py-1.5">
              <span className="min-w-0 flex-1 text-sm">
                <span className="block">{label}</span>
                <span className="block truncate text-muted-foreground">
                  {lesson?.title ?? 'A deleted lesson'}
                </span>
              </span>
              <fieldset className="border-0 p-0">
                <legend className="sr-only">
                  Question for {label}, {lesson?.title ?? 'a deleted lesson'}
                </legend>
                <Segmented
                  name={`split-${entry.id}`}
                  options={SIDES}
                  labels={SIDE_LABELS}
                  value={sides.get(entry.id) ?? '1'}
                  onChange={(side) => setSides((s) => new Map(s).set(entry.id, side))}
                />
              </fieldset>
            </li>
          );
        })}
      </ul>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={!ready}>
          Split
        </Button>
      </DialogFooter>
    </form>
  );
}
