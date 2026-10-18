import {
  DEFAULT_TRANSLATION,
  parseReference,
  translationLabel,
  type TranslationId,
  type VerseRef,
} from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import { toast } from '@lamp/ui/components/sonner';
import { Textarea } from '@lamp/ui/components/textarea';
import { useNavigate } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { useRef, useState } from 'react';
import { addInboxItem, addShared, undoShared } from '@/data/actions/inbox.ts';
import { useSettings } from '@/data/use-settings.ts';
import { reportWriteError, runWrite } from '@/lib/run-write.ts';
import { readShare, type ShareReading, shareHints } from '@/share/read-share.ts';
import { shareItems, withBookText } from '@/share/share-items.ts';
import { matchVerseText } from '@/verse-match/client.ts';

/** What a paste into the box holds, offered as chips while the box still has that text. */
interface PasteOffer {
  text: string;
  reading: ShareReading;
}

/**
 * The add box at the top of the Inbox (wireframes/interop.md): a verse or a note, typed or
 * pasted; Enter adds it and Shift+Enter starts a new line. An entry that is all one reference
 * ("Rom 8:28") becomes a chip in the default translation; anything else is kept as a note
 * (decided 2026-10-17). What was typed stays if saving fails.
 *
 * A paste holding references or known verses (F19, M9-09) offers chips under the box, read as
 * the share screen reads a share; Make chip adds them at once and Choose… opens the share screen
 * with its tick boxes (decided 2026-10-18). Off with `UserSettings.pasteChips`.
 */
export function AddBox({ onAdded }: { onAdded?: (id: string) => void }) {
  const settings = useSettings();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [offer, setOffer] = useState<PasteOffer | null>(null);
  const pastes = useRef(0);
  const translation = settings?.defaultTranslation ?? DEFAULT_TRANSLATION;
  // Typing on changes what was pasted: the offer goes.
  const shown = offer?.text === text ? offer : null;

  async function add() {
    const entry = text.trim();
    if (!entry || busy) return;
    setBusy(true);
    try {
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

  /** Reads the box as it is after a paste; a later paste or a change makes this one stale. */
  async function readPaste(value: string) {
    const paste = ++pastes.current;
    const input = { text: value };
    const matches = await matchVerseText(value, shareHints(input), { wait: false }).catch(() => []);
    if (paste !== pastes.current) return;
    const reading = readShare(input, matches, translation, 'pasted');
    setOffer(reading.verses.length > 0 ? { text: value, reading } : null);
  }

  async function makeChips({ reading }: PasteOffer) {
    if (busy) return;
    setBusy(true);
    try {
      const shared = await addShared(await shareItems(reading, reading.verses, 'paste'), null);
      setText('');
      setOffer(null);
      onAdded?.(shared.items[0]!.id);
      toast('Added to your inbox.', {
        duration: 10_000,
        action: { label: 'Undo', onClick: () => runWrite(undoShared(shared), 'a paste') },
      });
    } catch (error) {
      reportWriteError(error, 'a paste');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <form
        className="flex w-full items-end gap-2"
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
          onPaste={(event) => {
            if (!settings?.pasteChips) return;
            const box = event.currentTarget;
            // Read once the paste is in the box.
            setTimeout(() => void readPaste(box.value), 0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && shown) {
              event.preventDefault();
              setOffer(null);
              return;
            }
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            void add();
          }}
        />
        <Button type="submit" disabled={!text.trim() || busy} className="pointer-coarse:min-h-11">
          Add
        </Button>
      </form>
      {shown && (
        <PasteOfferPanel
          offer={shown}
          busy={busy}
          onMake={() => void makeChips(shown)}
          onChoose={() =>
            void navigate({ to: '/share', search: { text: shown.text, from: 'clipboard' } })
          }
          onDismiss={() => setOffer(null)}
        />
      )}
    </div>
  );
}

interface PasteOfferPanelProps {
  offer: PasteOffer;
  busy: boolean;
  onMake: () => void;
  onChoose: () => void;
  onDismiss: () => void;
}

/** The paste prompt for the add box (wireframes/interop.md "Paste prompt"). */
function PasteOfferPanel({ offer, busy, onMake, onChoose, onDismiss }: PasteOfferPanelProps) {
  const { verses } = offer.reading;
  const one = verses.length === 1 ? verses[0]! : null;
  return (
    <section
      aria-label="Verse chips"
      className="flex flex-col gap-2 rounded-lg bg-popover p-3 text-sm text-popover-foreground ring-1 ring-foreground/10"
    >
      <div className="flex items-start justify-between gap-2">
        <output aria-live="polite" className="pt-1.5 font-medium">
          {one
            ? `${one.ref.display} · ${translationLabel(one.ref)}`
            : `${verses.length} references found`}
        </output>
        <Button
          variant="ghost"
          size="icon-sm"
          className="pointer-coarse:size-11"
          aria-label="Keep the paste as it is"
          onClick={onDismiss}
        >
          <X />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" className="pointer-coarse:min-h-11" disabled={busy} onClick={onMake}>
          {one ? 'Make chip' : `Make ${verses.length} chips`}
        </Button>
        {!one && (
          <Button
            size="sm"
            variant="outline"
            className="pointer-coarse:min-h-11"
            disabled={busy}
            onClick={onChoose}
          >
            Choose…
          </Button>
        )}
      </div>
    </section>
  );
}

/**
 * The chip for an entry that is exactly one reference, with its text when the book is here (or
 * arrives in a moment); null for anything else.
 */
export async function chipFor(entry: string, translation: TranslationId): Promise<VerseRef | null> {
  const parsed = parseReference(entry);
  if (!parsed.ok) return null;
  return withBookText({ ...parsed.ref, translation }, translation);
}
