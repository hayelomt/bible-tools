import {
  DEFAULT_TRANSLATION,
  parseReference,
  type TranslationId,
  type VerseRef,
} from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import { Textarea } from '@lamp/ui/components/textarea';
import { useState } from 'react';
import { snapshotText, whenBook } from '@/data/bible.ts';
import { addInboxItem } from '@/data/actions/inbox.ts';
import { useSettings } from '@/data/use-settings.ts';
import { reportWriteError } from '@/lib/run-write.ts';

/** How long adding waits for a book that isn't here yet; the chip gets its text later. */
const BOOK_WAIT_MS = 2000;

/**
 * The add box at the top of the Inbox (wireframes/interop.md): a verse or a note, typed or
 * pasted; Enter adds it and Shift+Enter starts a new line. An entry that is all one reference
 * ("Rom 8:28") becomes a chip in the default translation; anything else is kept as a note
 * (decided 2026-10-17). What was typed stays if saving fails.
 */
export function AddBox({ onAdded }: { onAdded?: (id: string) => void }) {
  const settings = useSettings();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    const entry = text.trim();
    if (!entry || busy) return;
    setBusy(true);
    try {
      const translation = settings?.defaultTranslation ?? DEFAULT_TRANSLATION;
      const ref = await chipFor(entry, translation);
      const item = await addInboxItem({
        origin: 'typed',
        ref,
        text: ref ? null : entry,
      });
      setText('');
      onAdded?.(item.id);
    } catch (error) {
      reportWriteError(error, 'an inbox item');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void add();
      }}
    >
      <Textarea
        aria-label="Add a verse or a note"
        placeholder="Add a verse or a note…"
        rows={1}
        className="min-h-9 resize-none pointer-coarse:min-h-11"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          void add();
        }}
      />
      <Button type="submit" disabled={!text.trim() || busy} className="pointer-coarse:min-h-11">
        Add
      </Button>
    </form>
  );
}

/**
 * The chip for an entry that is exactly one reference, with its text when the book is here (or
 * arrives in a moment); null for anything else.
 */
export async function chipFor(entry: string, translation: TranslationId): Promise<VerseRef | null> {
  const parsed = parseReference(entry);
  if (!parsed.ok) return null;
  const ref: VerseRef = { ...parsed.ref, translation };
  const book = await Promise.race([
    whenBook(translation, ref.book),
    new Promise<null>((resolve) => setTimeout(resolve, BOOK_WAIT_MS, null)),
  ]);
  const text = book ? snapshotText(book, ref, translation) : '';
  return text ? { ...ref, snapshotText: text } : ref;
}
