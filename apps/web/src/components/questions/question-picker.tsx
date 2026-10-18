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
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Choice } from '@/components/reader/add-to-lesson.tsx';
import { type QuestionChoice, questionChoices } from '@/data/question-thread.ts';
import { shortDate } from '@/lib/dates.ts';

interface QuestionPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submit: string;
  /** The questions offered: Revisit offers open ones not in this lesson, Merge any other. */
  offers: (choice: QuestionChoice) => boolean;
  /** Shown when nothing is offered at all. */
  empty: string;
  onPick: (choice: QuestionChoice) => void;
}

/**
 * Picks a question (F24): "Revisit a question…" and "Merge with…". Searched by its text, newest
 * first, each with its own lesson.
 */
export function QuestionPicker({ open, onOpenChange, ...props }: QuestionPickerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>{open && <PickerForm {...props} />}</DialogContent>
    </Dialog>
  );
}

function PickerForm({
  title,
  description,
  submit,
  offers,
  empty,
  onPick,
}: Omit<QuestionPickerProps, 'open' | 'onOpenChange'>) {
  const choices = useLiveQuery(async () => (await questionChoices()).filter(offers), []);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  if (choices === undefined) return null;

  const words = query.trim().toLowerCase();
  const shown = words
    ? choices.filter((c) => c.question.text.toLowerCase().includes(words))
    : choices;
  const choice = choices.find((c) => c.question.id === (chosen ?? shown[0]?.question.id));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (choice) onPick(choice);
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {choices.length > 0 && (
        <Input
          type="search"
          aria-label="Search questions"
          placeholder="Search questions…"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setChosen(null);
          }}
        />
      )}
      <fieldset className="flex max-h-[50svh] min-w-0 flex-col gap-1 overflow-y-auto border-0 p-0">
        <legend className="sr-only">Question</legend>
        {choices.length === 0 && <p className="py-2 text-sm text-muted-foreground">{empty}</p>}
        {words && shown.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">
            No question matches “{query.trim()}”.
          </p>
        )}
        {shown.map(({ question, lesson }) => (
          <Choice
            key={question.id}
            name="question"
            value={question.id}
            checked={choice?.question.id === question.id}
            onChoose={setChosen}
          >
            {question.text}{' '}
            <span className="text-muted-foreground">
              · {lesson.title} · {shortDate(lesson.date)}
            </span>
          </Choice>
        ))}
      </fieldset>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={!choice}>
          {submit}
        </Button>
      </DialogFooter>
    </form>
  );
}
