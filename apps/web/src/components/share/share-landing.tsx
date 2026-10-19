import type { VerseTextMatch } from '@lamp/bible-data';
import { Button, buttonVariants } from '@lamp/ui/components/button';
import { Checkbox } from '@lamp/ui/components/checkbox';
import { Dialog, DialogContent } from '@lamp/ui/components/dialog';
import { toast } from '@lamp/ui/components/sonner';
import { Link, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { ChipLine } from '@/components/inbox/inbox-list.tsx';
import { type AddChoice, LessonPicker } from '@/components/reader/add-to-lesson.tsx';
import { ScreenTitle } from '@/components/shell/slots.tsx';
import type { PromoteTarget } from '@/data/actions/highlights.ts';
import { addShared, inboxItemTitle, type NewInboxItem, undoShared } from '@/data/actions/inbox.ts';
import { lessonById } from '@/data/queries.ts';
import { today } from '@/lib/dates.ts';
import { recentLessonId } from '@/lib/recent-lesson.ts';
import { reportWriteError, runWrite } from '@/lib/run-write.ts';
import { useScreenReady } from '@/lib/screen-ready.ts';
import { useAfter } from '@/lib/use-after.ts';
import type { ShareSearch } from '@/routes/_app/share.tsx';
import { readShare, type ShareReading, shareHints } from '@/share/read-share.ts';
import { shareItems } from '@/share/share-items.ts';
import { matchVerseText } from '@/verse-match/client.ts';

/**
 * The share screen (F18, M9-06, wireframes/interop.md "Share landing"): what a share holds, the
 * references and verses found in it, each ticked to start with, and where it goes: the inbox, the
 * lesson open in the last 10 minutes, or another lesson. "Add from clipboard" (M9-07) opens it
 * too, as a paste. References show at once; verses matched by their text join when the matcher
 * is ready, and the buttons work meanwhile with what's found.
 */
export function ShareLanding({ title, text, url, from }: ShareSearch) {
  const input = useMemo(() => ({ title, text, url }), [title, text, url]);
  const empty = !title?.trim() && !text?.trim() && !url?.trim();
  const [matches, setMatches] = useState<VerseTextMatch[] | null>(empty ? [] : null);
  useEffect(() => {
    if (empty) return;
    let live = true;
    void matchVerseText(input.text ?? '', shareHints(input)).then(
      (found) => live && setMatches(found),
    );
    return () => {
      live = false;
    };
  }, [empty, input]);
  const reading = useMemo(
    () => readShare(input, matches ?? [], from === 'clipboard' ? 'pasted' : 'shared'),
    [input, matches, from],
  );
  useScreenReady('share', true);

  const heading = from === 'clipboard' ? 'From the clipboard' : 'Shared to Lamp';
  if (empty) {
    return (
      <>
        <ScreenTitle>{heading}</ScreenTitle>
        <div className="flex flex-col items-start gap-4">
          <p>Nothing came through. Try sharing again, or paste into the Inbox.</p>
          <Link to="/inbox" className={buttonVariants()}>
            Go to inbox
          </Link>
        </div>
      </>
    );
  }
  return (
    <>
      <ScreenTitle>{heading}</ScreenTitle>
      <Found
        // Verses matched by their text can change the list: the ticks start over.
        key={reading.verses.map((v) => `${v.ref.display}|${v.ref.translation ?? ''}`).join('\n')}
        reading={reading}
        origin={from === 'clipboard' ? 'paste' : 'share'}
        looking={matches === null}
      />
    </>
  );
}

function Found({
  reading,
  origin,
  looking,
}: {
  reading: ShareReading;
  origin: NewInboxItem['origin'];
  looking: boolean;
}) {
  const navigate = useNavigate();
  const { verses, note, sourceUrl } = reading;
  const [unticked, setUnticked] = useState<ReadonlySet<number>>(new Set());
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const recentId = useMemo(() => recentLessonId(), []);
  const recent = useLiveQuery(() => (recentId ? lessonById(recentId) : null), [recentId]);
  const showLooking = useAfter(300) && looking;

  const chosen = verses.filter((_, i) => !unticked.has(i));
  const count = verses.length > 0 ? chosen.length : 1;
  const firstItem = { ref: chosen[0]?.ref ?? null, text: note };

  async function add(target: PromoteTarget | null) {
    if (busy || count === 0) return;
    setBusy(true);
    try {
      const shared = await addShared(shareItems(reading, chosen, origin), target);
      const undo = {
        label: 'Undo',
        onClick: () => runWrite(undoShared(shared), 'a share'),
      };
      if (shared.lesson) {
        toast(`Added to ${shared.lesson.title}.`, { duration: 10_000, action: undo });
        void navigate({
          to: '/lessons/$lessonId',
          params: { lessonId: shared.lesson.id },
          search: { section: shared.sections[0]?.id },
          replace: true,
        });
      } else {
        toast('Added to your inbox.', { duration: 10_000, action: undo });
        void navigate({ to: '/inbox', search: { added: shared.items[0]?.id }, replace: true });
      }
    } catch (error) {
      reportWriteError(error, 'a share');
      setBusy(false);
    }
  }

  function pick(choice: AddChoice) {
    setPicking(false);
    void add(choice === 'new' ? { newLesson: { date: today() } } : choice);
  }

  const several = count > 1 ? `${count} ` : '';
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="share-found" className="flex flex-col gap-3">
        <h2
          id="share-found"
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          {verses.length > 1 ? `Found ${verses.length}` : 'Found'}
        </h2>
        {verses.length === 0 && (
          <p className="text-muted-foreground">No verse found. It’s kept as a note.</p>
        )}
        {verses.length === 1 && <ChipLine verse={verses[0]!.ref} />}
        {verses.length > 1 && (
          <ul className="flex flex-col gap-3" aria-label="Verses found">
            {verses.map((verse, i) => (
              <li key={`${verse.ref.display}|${i}`}>
                <label className="flex items-start gap-3">
                  <Checkbox
                    className="mt-1"
                    checked={!unticked.has(i)}
                    onCheckedChange={(checked) =>
                      setUnticked((current) => {
                        const next = new Set(current);
                        if (checked) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <ChipLine verse={verse.ref} />
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {note && (
          <div className="flex flex-col gap-1">
            {verses.length > 1 && (
              <p className="text-sm text-muted-foreground">
                The rest of the text is kept as a note on the first.
              </p>
            )}
            <p className="line-clamp-6 break-words whitespace-pre-line">{note}</p>
          </div>
        )}
        {sourceUrl && (
          <p className="truncate text-sm text-muted-foreground">from {shortAddress(sourceUrl)}</p>
        )}
        {showLooking && (
          <output className="text-sm text-muted-foreground">Looking for verses…</output>
        )}
      </section>

      {/* Drawn once the recent lesson is known, so the filled button doesn't move. */}
      {recent !== undefined && (
        <div className="flex flex-col items-stretch gap-2 sm:items-start">
          {recent && (
            <Button
              disabled={busy || count === 0}
              onClick={() => void add({ lessonId: recent.id })}
            >
              Add {several}to {recent.title}
            </Button>
          )}
          <Button
            variant={recent ? 'outline' : 'default'}
            disabled={busy || count === 0}
            onClick={() => void add(null)}
          >
            Add {several}to inbox
          </Button>
          <Button
            variant="link"
            className="self-start px-0"
            disabled={busy || count === 0}
            onClick={() => setPicking(true)}
          >
            Add to another lesson…
          </Button>
        </div>
      )}

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent>
          {picking && (
            <LessonPicker
              title="Add to a lesson"
              description="Adds a section at the end of the lesson for each item."
              newLesson={inboxItemTitle(firstItem)}
              submit="Add"
              onPick={pick}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** "bible.com/bible/3034/JHN.10": the address without its scheme, `www.` and query. */
function shortAddress(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    return `${hostname.replace(/^www\./, '')}${pathname === '/' ? '' : pathname}`;
  } catch {
    return url;
  }
}
