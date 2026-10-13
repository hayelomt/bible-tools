import { newId, type Takeaway } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import { toast } from '@lamp/ui/components/sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { XIcon } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  createTakeaway,
  removeTakeaway,
  restoreTakeaway,
  updateTakeaway,
} from '@/data/actions/takeaways.ts';
import { lessonTakeaways } from '@/data/queries.ts';
import { afterPress } from '@/lib/after-press.ts';
import { reportWriteError, runWrite } from '@/lib/run-write.ts';
import { SAVE_DELAY_MS } from './use-lesson-saver.ts';
import { PanelHeading } from './panel-heading.tsx';

interface Row {
  id: string;
  text: string;
  /** False for a draft: shown, but not stored until it has text. */
  stored: boolean;
}

/** Where the cursor goes; numbered, so asking for the same row again moves it again. */
interface Focus {
  id: string;
  at: 'start' | 'end';
  seq: number;
}

/** Deletes a stored takeaway at once, with Undo (UX-PATTERNS "Confirmations"). */
function deleteWithUndo(id: string) {
  runWrite(
    removeTakeaway(id).then(() =>
      toast('Takeaway deleted.', {
        duration: 10_000,
        action: { label: 'Undo', onClick: () => runWrite(restoreTakeaway(id), 'a takeaway') },
      }),
    ),
    'a takeaway',
  );
}

/**
 * A lesson's takeaways (F5, wireframes/lessons.md): short lines, typed in place and saved as
 * they're typed. "+ Add" or Enter starts the next one; Backspace in an empty one removes it, and
 * × deletes one with Undo. A new takeaway is a draft until it has text, like a section.
 */
export function Takeaways({ lessonId }: { lessonId: string }) {
  const stored = useLiveQuery(() => lessonTakeaways(lessonId), [lessonId]);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [focus, setFocus] = useState<Focus | null>(null);
  const headingId = useId();
  const seq = useRef(0);

  const storedIds = new Set(stored?.map((t) => t.id));
  const rows: Row[] = [
    ...(stored ?? []).map((t: Takeaway) => ({ id: t.id, text: t.text, stored: true })),
    ...drafts.filter((id) => !storedIds.has(id)).map((id) => ({ id, text: '', stored: false })),
  ];
  const rowsRef = useRef(rows);
  useLayoutEffect(() => {
    rowsRef.current = rows;
  });

  const focusAt = useCallback((id: string, at: Focus['at']) => {
    setFocus({ id, at, seq: ++seq.current });
  }, []);

  /**
   * A new takeaway at the end, with the cursor in it. An empty one left behind goes as it loses
   * focus, so there's never more than one.
   */
  const add = useCallback(() => {
    const id = newId();
    setDrafts((ds) => [...ds, id]);
    focusAt(id, 'start');
  }, [focusAt]);

  const discard = useCallback((id: string) => setDrafts((ds) => ds.filter((d) => d !== id)), []);

  /** Backspace in an empty takeaway: the cursor goes to the end of the one above as it goes. */
  const focusNear = useCallback(
    (id: string) => {
      const all = rowsRef.current;
      const index = all.findIndex((r) => r.id === id);
      const near = all[index - 1] ?? all[index + 1];
      if (near) focusAt(near.id, 'end');
    },
    [focusAt],
  );

  if (!stored) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <PanelHeading id={headingId} add={{ label: 'Add takeaway', onClick: add }}>
        Takeaways
      </PanelHeading>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing yet. A takeaway is one line you want to remember.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((row) => (
            <TakeawayRow
              key={row.id}
              row={row}
              lessonId={lessonId}
              focus={focus?.id === row.id ? focus : undefined}
              onEnter={add}
              onFocusNear={focusNear}
              onDiscard={discard}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface TakeawayRowProps {
  row: Row;
  lessonId: string;
  focus: Focus | undefined;
  onEnter: () => void;
  onFocusNear: (id: string) => void;
  onDiscard: (id: string) => void;
}

/** A takeaway is one line: pasted line breaks become spaces. */
const oneLine = (text: string) => text.replace(/\s*\n\s*/g, ' ');

function TakeawayRow({ row, lessonId, focus, onEnter, onFocusNear, onDiscard }: TakeawayRowProps) {
  const [text, setText] = useState(row.text);
  const field = useRef<HTMLTextAreaElement>(null);
  const stored = useRef(row.stored);
  const pending = useRef<string | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const writes = useRef(Promise.resolve());
  // Set when the row is being removed, so leaving it doesn't also delete or save it.
  const gone = useRef(false);
  const [focused, setFocused] = useState(false);

  // A change stored elsewhere (another tab, later a sync) shows, unless this one is being typed
  // in. Leaving it stores what was typed first, so nothing typed is replaced.
  const [seen, setSeen] = useState(row.text);
  if (row.text !== seen) {
    setSeen(row.text);
    if (!focused) setText(row.text);
  }

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const value = pending.current;
    pending.current = undefined;
    // An emptied takeaway keeps its stored text until it's deleted (on blur).
    if (value === undefined || !value.trim() || gone.current) return;
    writes.current = writes.current
      .then(async () => {
        if (stored.current) {
          await updateTakeaway(row.id, value);
        } else {
          await createTakeaway({ id: row.id, lessonId, text: value });
          stored.current = true;
        }
      })
      .catch((error: unknown) => reportWriteError(error, 'a takeaway'));
  }, [row.id, lessonId]);

  // Nothing typed is lost when the screen closes or the page is hidden.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  useLayoutEffect(() => {
    if (!focus || !field.current) return;
    const end = focus.at === 'end' ? field.current.value.length : 0;
    field.current.focus();
    field.current.setSelectionRange(end, end);
  }, [focus]);

  // The field grows with its text (and its width), so a long takeaway wraps instead of scrolling.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  });

  /** Deletes it once any write for it is done, so a create still running isn't left behind. */
  function remove({ undo }: { undo: boolean }) {
    gone.current = true;
    clearTimeout(timer.current);
    pending.current = undefined;
    writes.current = writes.current.then(() => {
      if (!stored.current) onDiscard(row.id);
      else if (undo) deleteWithUndo(row.id);
      else runWrite(removeTakeaway(row.id), 'a takeaway');
    });
  }

  return (
    <li className="group/takeaway flex items-start gap-2">
      <span aria-hidden className="pt-1 leading-6 text-muted-foreground pointer-coarse:pt-2.5">
        •
      </span>
      <textarea
        ref={field}
        value={text}
        rows={1}
        maxLength={2000}
        aria-label="Takeaway"
        placeholder="One line to remember"
        className="min-w-0 flex-1 resize-none overflow-hidden bg-transparent py-1 leading-6 outline-none placeholder:text-muted-foreground pointer-coarse:min-h-11 pointer-coarse:py-2.5"
        onChange={(event) => {
          const value = oneLine(event.target.value);
          setText(value);
          pending.current = value;
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, SAVE_DELAY_MS);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            if (!text.trim()) return;
            flush();
            onEnter();
          } else if (event.key === 'Backspace' && text === '') {
            event.preventDefault();
            onFocusNear(row.id);
            remove({ undo: false });
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (gone.current) return;
          flush();
          // Leaving a takeaway empty deletes it: a draft quietly, a stored one with Undo.
          if (!text.trim()) afterPress(() => remove({ undo: true }));
        }}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={text.trim() ? `Delete takeaway “${text.trim()}”` : 'Delete takeaway'}
        className="text-muted-foreground opacity-0 group-focus-within/takeaway:opacity-100 group-hover/takeaway:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
        // Keeps the field from blurring first, which would delete an empty one twice.
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => remove({ undo: true })}
      >
        <XIcon />
      </Button>
    </li>
  );
}
