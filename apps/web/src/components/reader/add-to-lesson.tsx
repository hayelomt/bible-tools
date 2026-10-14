import type { Lesson } from '@lamp/domain';
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
import { useId, useState } from 'react';
import { allLessons } from '@/data/queries.ts';
import { shortDate } from '@/lib/dates.ts';

/** How many recent lessons show before a search. */
const RECENT = 5;

export type AddChoice = { lessonId: string } | 'new';

interface AddToLessonProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The verses, as shown: "John 10:11". */
  label: string;
  onAdd: (choice: AddChoice) => void;
}

/**
 * "Add to lesson" (wireframes/reader.md, M5-03): recent lessons first, a search for older ones,
 * or a new lesson named after the verses.
 */
export function AddToLesson({ open, onOpenChange, label, onAdd }: AddToLessonProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted only while open, so each opening starts at the most recent lesson. */}
        {open && <AddForm label={label} onAdd={onAdd} />}
      </DialogContent>
    </Dialog>
  );
}

function AddForm({ label, onAdd }: Pick<AddToLessonProps, 'label' | 'onAdd'>) {
  const lessons = useLiveQuery(() => allLessons(), []);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const ids = { search: useId(), list: useId() };
  if (lessons === undefined) return null;

  const words = query.trim().toLowerCase();
  const shown = words
    ? lessons.filter((lesson) => lesson.title.toLowerCase().includes(words))
    : lessons.slice(0, RECENT);
  // The most recent lesson until another is picked; a new lesson when there are none.
  const choice = chosen ?? lessons[0]?.id ?? 'new';

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onAdd(choice === 'new' ? 'new' : { lessonId: choice });
      }}
    >
      <DialogHeader>
        <DialogTitle>Add {label} to a lesson</DialogTitle>
        <DialogDescription>Adds a section with the verse and your note.</DialogDescription>
      </DialogHeader>
      {lessons.length > RECENT && (
        <Input
          id={ids.search}
          type="search"
          aria-label="Search lessons"
          placeholder="Search lessons…"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Enter picks the first match rather than adding to whichever lesson was chosen.
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (shown[0]) setChosen(shown[0].id);
          }}
        />
      )}
      <fieldset className="flex max-h-[50svh] min-w-0 flex-col gap-1 overflow-y-auto border-0 p-0">
        <legend className="sr-only">Lesson</legend>
        {words && shown.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">No lesson matches “{query.trim()}”.</p>
        )}
        {shown.map((lesson) => (
          <Choice
            key={lesson.id}
            value={lesson.id}
            checked={choice === lesson.id}
            onChoose={setChosen}
          >
            <LessonLabel lesson={lesson} />
          </Choice>
        ))}
        <Choice value="new" checked={choice === 'new'} onChoose={setChosen}>
          New lesson “{label}”
        </Choice>
      </fieldset>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit">Add</Button>
      </DialogFooter>
    </form>
  );
}

function Choice({
  value,
  checked,
  onChoose,
  children,
}: {
  value: string;
  checked: boolean;
  onChoose: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50 pointer-coarse:min-h-11">
      <input
        type="radio"
        name="lesson"
        value={value}
        checked={checked}
        onChange={() => onChoose(value)}
        className="size-4 shrink-0 accent-primary outline-none"
      />
      <span className="min-w-0 flex-1 truncate text-sm">{children}</span>
    </label>
  );
}

function LessonLabel({ lesson }: { lesson: Lesson }) {
  return (
    <>
      {lesson.title} <span className="text-muted-foreground">· {shortDate(lesson.date)}</span>
    </>
  );
}
