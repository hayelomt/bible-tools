import {
  isAppTranslation,
  keyBetween,
  type Lesson,
  newId,
  type Section,
  type VerseRef,
} from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@lamp/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@lamp/ui/components/dropdown-menu';
import { Input } from '@lamp/ui/components/input';
import { Label } from '@lamp/ui/components/label';
import type { Editor } from '@tiptap/core';
import { Selection } from '@tiptap/pm/state';
import { useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, Ellipsis } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { outline } from '@/components/sections/outline.ts';
import { referenceEntries } from '@/components/verses/find-reference.ts';
import { chipFor } from '@/components/verses/verse-suggestion.ts';
import { VerseText } from '@/components/verses/verse-text.tsx';
import { VerseViewer } from '@/components/verses/verse-viewer.tsx';
import { RowNotFoundError } from '@/data/action.ts';
import { setSourceStart, startCapture } from '@/data/actions/capture.ts';
import { removeSection } from '@/data/actions/sections.ts';
import { snapshotText, useBook } from '@/data/bible.ts';
import { db, SYNC_STATE_KEY } from '@/data/db.ts';
import { lessonSections } from '@/data/queries.ts';
import { runWrite } from '@/lib/run-write.ts';
import { atTimeOfDay, clockLabel, timeOfDay } from '@/lib/source-time.ts';
import { useWakeLock } from '@/lib/use-wake-lock.ts';
import { type CaptureApi, type CaptureRow, CaptureSection } from './capture-section.tsx';

/**
 * Capture mode (F26, wireframes/sermon.md "Capture mode"): for keeping up during a sermon. The
 * lesson's sections with their times in the source, the prep passage pinned above them, a quick
 * verse box and a large New section below. Plain text only: no tags, formatting, replies or drag.
 * Done goes back to the lesson, where the same sections are ordinary ones.
 */
export function CaptureScreen({ lesson }: { lesson: Lesson }) {
  const navigate = useNavigate();
  const sections = useLiveQuery(() => lessonSections(lesson.id), [lesson.id]);
  const offset = useLiveQuery(async () => (await db.syncState.get(SYNC_STATE_KEY))?.clockOffsetMs);
  const offsetRef = useRef(0);
  offsetRef.current = offset ?? 0;
  useWakeLock();

  // The clock starts when capture first opens on a lesson without a start (decided 2026-10-19).
  useEffect(() => {
    if (!lesson.sourceStartedAt) runWrite(startCapture(lesson.id), 'the start time');
  }, [lesson.id, lesson.sourceStartedAt]);

  // Sections typed here that the live query doesn't have yet, and the empty one at the end,
  // ready to type in, which joins them on its first character.
  const [typed, setTyped] = useState<CaptureRow[]>([]);
  const [trailingId, setTrailingId] = useState(newId);
  const editors = useRef(new Map<string, Editor>());
  const current = useRef<string | null>(null);
  const wantFocus = useRef<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const verseBox = useRef<HTMLInputElement>(null);
  const writes = useRef(Promise.resolve());

  const rows = useMemo(() => {
    if (!sections) return null;
    const ids = new Set(sections.map((s) => s.id));
    const stored = outline(sections.map(storedRow)).map((r) => r.item);
    const before = [...stored, ...typed.filter((d) => !ids.has(d.id))];
    const top = before.filter((r) => r.parentId === null).at(-1);
    return [...before, emptyRow(trailingId, top?.orderKey ?? null)];
  }, [sections, typed, trailingId]);
  const rowsRef = useRef(rows);
  useLayoutEffect(() => {
    rowsRef.current = rows;
  });

  /** Puts the cursor at the end of a section, once it has its editor. */
  const focusSection = (id: string) => {
    wantFocus.current = id;
    setFocusTick((n) => n + 1);
  };
  useEffect(() => {
    const id = wantFocus.current;
    const editor = id ? editors.current.get(id) : undefined;
    if (!editor) return;
    wantFocus.current = null;
    // At once, not in the next frame as TipTap's `focus` does: typing straight after New section
    // must land in it.
    const end = Selection.atEnd(editor.state.doc);
    editor.view.dispatch(editor.state.tr.setSelection(end).scrollIntoView());
    editor.view.focus();
  }, [focusTick, rows]);

  const lastEditable = () => rows?.findLast((r) => editors.current.has(r.id))?.id ?? null;

  const api = useMemo<CaptureApi>(
    () => ({
      lessonId: lesson.id,
      enqueue: (write) => {
        writes.current = writes.current
          .then(async () => {
            await write();
          })
          .catch((error: unknown) => {
            if (error instanceof RowNotFoundError) return;
            // The storage-full toast (states.md) reports this; the text stays on screen.
            console.error('Saving a section failed', error);
          });
      },
      now: () => new Date(Date.now() + offsetRef.current).toISOString(),
      register: (id, editor) => {
        if (editor) editors.current.set(id, editor);
        else editors.current.delete(id);
      },
      setCurrent: (id) => {
        current.current = id;
      },
      markStarted: (id, sourceAt) => {
        const row = rowsRef.current?.find((r) => r.id === id);
        if (!row || id !== trailingId) return;
        setTyped((ds) => [...ds, { ...row, sourceAt }]);
        setTrailingId(newId());
      },
      newSection: () => newSection(),
      backspaceEmpty: (id) => {
        const index = rows?.findIndex((r) => r.id === id) ?? -1;
        const above = rows?.slice(0, Math.max(index, 0)).findLast((r) => editors.current.has(r.id));
        if (!above) return false;
        const row = rows![index]!;
        if (row.stored) runWrite(removeSection(id), 'a section');
        else if (id !== trailingId) setTyped((ds) => ds.filter((d) => d.id !== id));
        focusSection(above.id);
        return true;
      },
      verseBox: () => verseBox.current?.focus(),
    }),
    // `rows` changes as sections are typed; the keys read it when pressed.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [lesson.id, rows, trailingId],
  );

  /** New section: the empty one at the end, ready to type. */
  function newSection() {
    focusSection(trailingId);
  }

  /** The quick verse box's chip goes where the cursor was, or at the end of the last section. */
  function insertChip(ref: VerseRef) {
    const id =
      (current.current && editors.current.has(current.current) && current.current) ||
      lastEditable();
    const editor = id ? editors.current.get(id) : undefined;
    if (!editor) return;
    editor
      .chain()
      .focus(current.current === id ? undefined : 'end')
      .insertContent([
        { type: 'verse', attrs: ref },
        { type: 'text', text: ' ' },
      ])
      .run();
  }

  // Laptop keys: Ctrl+Enter is New section, and Ctrl+K the verse box, from anywhere.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.defaultPrevented) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        newSection();
      } else if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        verseBox.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  const done = () => void navigate({ to: '/lessons/$lessonId', params: { lessonId: lesson.id } });
  const onlyDraft = rows?.length === 1;

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-2 px-4">
          <Button variant="outline" onClick={done} className="pointer-coarse:min-h-11">
            Done
          </Button>
          <Clock startedAt={lesson.sourceStartedAt} offset={offset ?? 0} />
          <h1 className="sr-only">Capture: {lesson.title}</h1>
          <StartMenu lesson={lesson} />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pt-4 pb-4">
        {lesson.mainPassages[0] && <PinnedPassage passage={lesson.mainPassages[0]} />}
        {rows && (
          <section className="flex flex-col gap-4" aria-label="Sections">
            {rows.map((row) => (
              <CaptureSection
                key={row.id}
                row={row}
                startedAt={lesson.sourceStartedAt}
                api={api}
                first={onlyDraft}
              />
            ))}
          </section>
        )}
      </main>
      <footer className="sticky bottom-0 border-t bg-background pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-4 py-3">
          <VerseBox inputRef={verseBox} onInsert={insertChip} />
          <Button size="lg" onClick={newSection} className="h-12 w-full text-base">
            + New section
          </Button>
        </div>
      </footer>
      <VerseViewer />
    </div>
  );
}

function storedRow(section: Section): CaptureRow {
  return {
    id: section.id,
    parentId: section.parentId,
    orderKey: section.orderKey,
    body: section.body,
    sourceAt: section.sourceAt,
    stored: true,
    updatedAt: section.updatedAt,
  };
}

function emptyRow(id: string, after: string | null): CaptureRow {
  return {
    id,
    parentId: null,
    orderKey: keyBetween(after, null),
    body: { type: 'doc', content: [{ type: 'paragraph' }] },
    sourceAt: null,
    stored: false,
    updatedAt: null,
  };
}

/** `● 23:14`: time since the start, ticking each second. */
function Clock({ startedAt, offset }: { startedAt: string | null; offset: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!startedAt) return <span className="flex-1" />;
  return (
    <p className="flex flex-1 items-center justify-center gap-1.5 font-medium tabular-nums">
      <span aria-hidden className="size-2 rounded-full bg-destructive" />
      <span className="sr-only">Time since the start: </span>
      {clockLabel(now + offset - Date.parse(startedAt))}
    </p>
  );
}

/** The header's `⋯`: Set the start. */
function StartMenu({ lesson }: { lesson: Lesson }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Capture actions"
              className="pointer-coarse:size-11"
            />
          }
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setOpen(true)}>Set the start…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <StartDialog lesson={lesson} open={open} onOpenChange={setOpen} />
    </>
  );
}

/** "The recording starts at 10:30": the sections' times move with it. */
function StartDialog({
  lesson,
  open,
  onOpenChange,
}: {
  lesson: Lesson;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && <StartForm lesson={lesson} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function StartForm({ lesson, onDone }: { lesson: Lesson; onDone: () => void }) {
  const id = useId();
  const errorId = useId();
  const [startedAt] = useState(() => lesson.sourceStartedAt ?? new Date().toISOString());
  const [time, setTime] = useState(() => timeOfDay(startedAt));
  const [error, setError] = useState(false);

  function save(event: React.FormEvent) {
    event.preventDefault();
    const at = atTimeOfDay(startedAt, time);
    if (!at) return setError(true);
    runWrite(setSourceStart(lesson.id, at), 'the start time');
    onDone();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Set the start</DialogTitle>
        <DialogDescription>
          When the recording starts. Each section’s time counts from it.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>The recording starts at</Label>
        <Input
          id={id}
          type="time"
          step={1}
          value={time}
          aria-invalid={error || undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setTime(event.target.value);
            setError(false);
          }}
        />
        {error && (
          <p id={errorId} className="text-sm text-destructive">
            Enter a time, like 10:30.
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Set</Button>
      </DialogFooter>
    </form>
  );
}

/** `JOHN 10:1–18 ▾`: the prep passage, pinned; ▾ shows its text. */
function PinnedPassage({ passage }: { passage: VerseRef }) {
  const [open, setOpen] = useState(false);
  const textId = useId();
  return (
    <section aria-label="Passage" className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={textId}
        onClick={() => setOpen((o) => !o)}
        className="-mx-1 flex items-center justify-between gap-2 rounded-md px-1 text-sm font-medium tracking-wide uppercase outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
      >
        {passage.display}
        <ChevronDown
          aria-hidden
          className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div id={textId} className="max-h-48 overflow-y-auto rounded-lg bg-muted p-3">
          <PassageText passage={passage} />
        </div>
      )}
    </section>
  );
}

function PassageText({ passage }: { passage: VerseRef }) {
  const translation = isAppTranslation(passage.translation) ? passage.translation : 'BSB';
  const book = useBook(translation, passage.book);
  if (passage.snapshotText) {
    return (
      <VerseText passage={passage} translation={passage.translation} text={passage.snapshotText} />
    );
  }
  if (book.status === 'loading') return null;
  if (book.status === 'missing') {
    return <p className="text-sm text-muted-foreground">Text not downloaded yet.</p>;
  }
  return (
    <VerseText
      passage={passage}
      translation={translation}
      text={snapshotText(book.text, passage, translation)}
    />
  );
}

/**
 * The quick verse box: a reference as typed ("rom 8 28") becomes a chip at the cursor on Enter or
 * Insert. No list opens, so nothing covers the notes; an impossible reference says why.
 */
function VerseBox({
  inputRef,
  onInsert,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onInsert: (ref: VerseRef) => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const errorId = useId();

  function insert(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    // "rom 8 28" as typed in a hurry is Romans 8:28.
    const entries = referenceEntries(text.trim().replace(/(\d+)\s+(\d+)$/u, '$1:$2'));
    const passage = entries.find((entry) => entry.kind === 'passage');
    if (!passage) {
      const reason = entries.find((entry) => entry.kind === 'error');
      setError(reason?.message ?? 'That isn’t a Bible reference.');
      return;
    }
    onInsert(chipFor(passage.ref));
    setText('');
    setError(null);
  }

  return (
    <form onSubmit={insert} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <label htmlFor={id} className="sr-only">
          Verse
        </label>
        <Input
          ref={inputRef}
          id={id}
          value={text}
          placeholder="Verse: rom 8 28"
          autoComplete="off"
          enterKeyHint="done"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
          className="pointer-coarse:h-11"
        />
        <Button type="submit" variant="outline" className="pointer-coarse:min-h-11">
          Insert
        </Button>
      </div>
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
