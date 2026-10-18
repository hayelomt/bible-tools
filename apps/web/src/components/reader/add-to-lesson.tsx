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
        {open && (
          <LessonPicker
            title={`Add ${label} to a lesson`}
            description="Adds a section with the verse and your note."
            newLesson={label}
            submit="Add"
            onPick={onAdd}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface LessonPickerProps {
  title: string;
  description: string;
  /** The title of the new lesson offered last; null offers none. */
  newLesson: string | null;
  submit: string;
  onPick: (choice: AddChoice) => void;
  /** Fields above the lessons, such as the text of a takeaway to make (M11-03). */
  children?: React.ReactNode;
  /** The form can't be sent yet (a field is empty). */
  disabled?: boolean;
}

/**
 * The form inside a dialog that picks a lesson: the most recent chosen to start with, so it's one
 * tap; a search once there are more than five.
 */
export function LessonPicker({
  title,
  description,
  newLesson,
  submit,
  onPick,
  children,
  disabled = false,
}: LessonPickerProps) {
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
  const choice = chosen ?? lessons[0]?.id ?? (newLesson === null ? null : 'new');

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (choice && !disabled) onPick(choice === 'new' ? 'new' : { lessonId: choice });
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {children}
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
        {lessons.length === 0 && newLesson === null && (
          <p className="py-2 text-sm text-muted-foreground">No lessons yet.</p>
        )}
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
        {newLesson !== null && (
          <Choice value="new" checked={choice === 'new'} onChoose={setChosen}>
            New lesson “{newLesson}”
          </Choice>
        )}
      </fieldset>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={!choice || disabled}>
          {submit}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function Choice({
  name = 'lesson',
  value,
  checked,
  onChoose,
  children,
}: {
  name?: string;
  value: string;
  checked: boolean;
  onChoose: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50 pointer-coarse:min-h-11">
      <input
        type="radio"
        name={name}
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
