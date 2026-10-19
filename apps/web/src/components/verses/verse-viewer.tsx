import { passageSlug, translationName } from '@lamp/domain';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
} from '@lamp/ui/components/popover';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@lamp/ui/components/sheet';
import { buttonVariants } from '@lamp/ui/components/button';
import { Link } from '@tanstack/react-router';
import { Check, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useActiveTranslation } from '@/data/translation.ts';
import { useMediaQuery } from '@/lib/use-media-query.ts';
import { memoriseVerse, storedRef, useMemoryItem } from '../memory/memorise.ts';
import {
  chipAt,
  closeChip,
  hoverLeave,
  hoverStay,
  leaveChip,
  type OpenChip,
  useOpenChip,
} from './verse-chip.ts';
import { OpenInLinks } from './open-in-links.tsx';
import { LAPTOP_QUERY } from './verse-suggestions.tsx';
import { RefText } from './verse-text.tsx';

/**
 * An open verse chip (wireframes/verses.md "Verse chip"): its reference, the translation's name and
 * its text, in the translation picked in Settings for the app's own (decision 97). A popover under the chip on a
 * laptop, a bottom sheet on a phone; Esc, a tap outside or × closes it. One for the page. Opened
 * by resting the mouse on the chip, the popover leaves focus in the note and closes as the pointer
 * leaves both.
 */
export function VerseViewer() {
  const open = useOpenChip();
  const laptop = useMediaQuery(LAPTOP_QUERY);
  const active = useActiveTranslation();
  // The last chip stays drawn while the viewer closes.
  const [shown, setShown] = useState<OpenChip | null>(open);
  if (open && open !== shown) setShown(open);

  if (laptop) {
    return (
      <Popover open={!!open} onOpenChange={onOpenChange}>
        {shown && (
          <PopoverContent
            anchor={shown.anchor}
            align="start"
            // Focus goes back to the note by `closeChip`; on hover it never left.
            initialFocus={!shown.hover}
            finalFocus={false}
            onMouseEnter={hoverStay}
            onMouseLeave={hoverLeave}
            className="w-80 gap-3 p-4"
          >
            <PopoverHeader>
              <PopoverTitle className="text-base">{shown.ref.display}</PopoverTitle>
              <PopoverDescription>{translationName(shown.ref, active)}</PopoverDescription>
            </PopoverHeader>
            <ChipText chip={shown} />
            <IndexLink chip={shown} />
            <ChipActions chip={shown} />
            <OpenInLinks chip={shown.ref} />
          </PopoverContent>
        )}
      </Popover>
    );
  }
  return (
    <Sheet open={!!open} onOpenChange={onOpenChange}>
      {shown && (
        <SheetContent
          side="bottom"
          finalFocus={false}
          className="mx-auto max-h-[85svh] w-full max-w-2xl gap-0 overflow-y-auto rounded-t-2xl border-x pb-[env(safe-area-inset-bottom)] motion-reduce:data-ending-style:translate-y-0 motion-reduce:data-starting-style:translate-y-0"
        >
          <div className="flex flex-col gap-0.5 px-4 pt-4 pb-3">
            <SheetTitle className="text-lg">{shown.ref.display}</SheetTitle>
            <SheetDescription>{translationName(shown.ref, active)}</SheetDescription>
          </div>
          <div className="flex flex-col gap-3 px-4 pb-6">
            <ChipText chip={shown} />
            <IndexLink chip={shown} />
            <ChipActions chip={shown} />
            <OpenInLinks chip={shown.ref} />
          </div>
        </SheetContent>
      )}
    </Sheet>
  );
}

function onOpenChange(next: boolean, details: { reason: string; event: Event }) {
  if (next) return;
  // A click on the open chip opens it (pinning one open on hover); it isn't a press outside.
  const target = details.event.target;
  if (details.reason === 'outside-press' && target instanceof Node && chipAt(target)) return;
  closeChip();
}

/** The chip's text, or, while its book isn't downloaded, that it's coming. */
function ChipText({ chip: { ref } }: { chip: OpenChip }) {
  return (
    <RefText
      verse={ref}
      className="text-[17px] leading-[1.6]"
      missing={
        ref.translation
          ? 'No text came with it.'
          : 'Text not downloaded yet. It shows once the Bible is downloaded.'
      }
    />
  );
}

const ROW_LINK =
  '-mx-2 flex items-center justify-between rounded-lg px-2 py-2 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11';

/** To the verse index for the chip's passage (M4-07), and to its commentary (M10-02). */
function IndexLink({ chip: { ref } }: { chip: OpenChip }) {
  return (
    <div className="flex flex-col">
      <Link
        to="/verses/$passage"
        params={{ passage: passageSlug(ref) }}
        className={ROW_LINK}
        onClick={leaveChip}
      >
        Every note on {ref.display}
        <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
      </Link>
      <Link
        to="/compile/$passage"
        params={{ passage: passageSlug(ref) }}
        className={ROW_LINK}
        onClick={leaveChip}
      >
        Read as commentary
        <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
      </Link>
    </div>
  );
}

/**
 * "Read in context" opens the reader at the chip's first verse (M5-04); "Memorise" adds the passage
 * to the memory verses, or shows that it's there already (M6-01).
 */
function ChipActions({ chip }: { chip: OpenChip }) {
  const ref = storedRef(chip.ref);
  const memory = useMemoryItem(ref);
  const button = buttonVariants({ variant: 'outline', className: 'pointer-coarse:min-h-11' });
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        to="/read/$chapter"
        params={{
          chapter: passageSlug({
            book: ref.book,
            chapter: ref.chapter,
            verseStart: ref.verseStart,
          }),
        }}
        onClick={leaveChip}
        data-slot="button"
        className={button}
      >
        Read in context
        <ChevronRight aria-hidden />
      </Link>
      {memory ? (
        <Link
          to="/verses/$passage"
          params={{ passage: passageSlug(ref) }}
          search={{ show: 'memory' }}
          onClick={leaveChip}
          data-slot="button"
          className={button}
        >
          In memory verses
          <Check aria-hidden />
        </Link>
      ) : (
        <button
          type="button"
          disabled={memory === undefined}
          onClick={() => void memoriseVerse(ref)}
          data-slot="button"
          className={button}
        >
          Memorise
        </button>
      )}
    </div>
  );
}
