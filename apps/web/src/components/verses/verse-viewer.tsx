import { TRANSLATION_NAMES, type TranslationId } from '@lamp/domain';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
} from '@lamp/ui/components/popover';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@lamp/ui/components/sheet';
import { useState } from 'react';
import { useMediaQuery } from '@/lib/use-media-query.ts';
import { closeChip, type OpenChip, useOpenChip } from './verse-chip.ts';
import { LAPTOP_QUERY } from './verse-suggestions.tsx';

/**
 * An open verse chip (wireframes/verses.md "Verse chip"): its reference, the translation's name and
 * the text captured when it was inserted, which never changes. A popover under the chip on a
 * laptop, a bottom sheet on a phone; Esc, a tap outside or × closes it. One for the page.
 */
export function VerseViewer() {
  const open = useOpenChip();
  const laptop = useMediaQuery(LAPTOP_QUERY);
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
            // Focus goes back to the note by `closeChip`.
            finalFocus={false}
            className="w-80 gap-3 p-4"
          >
            <PopoverHeader>
              <PopoverTitle className="text-base">{shown.ref.display}</PopoverTitle>
              <PopoverDescription>{translationName(shown)}</PopoverDescription>
            </PopoverHeader>
            <ChipText chip={shown} />
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
            <SheetDescription>{translationName(shown)}</SheetDescription>
          </div>
          <div className="px-4 pb-6">
            <ChipText chip={shown} />
          </div>
        </SheetContent>
      )}
    </Sheet>
  );
}

function onOpenChange(next: boolean) {
  if (!next) closeChip();
}

function translationName({ ref }: OpenChip): string {
  return TRANSLATION_NAMES[ref.translation as TranslationId] ?? ref.translation;
}

/** The snapshot, or, for a chip inserted before its book was downloaded, that it's coming. */
function ChipText({ chip: { ref } }: { chip: OpenChip }) {
  if (!ref.snapshotText) {
    return (
      <p className="text-muted-foreground">
        Text not downloaded yet. It’s added when the Bible is downloaded.
      </p>
    );
  }
  return <p className="font-serif text-[17px] leading-[1.6]">{ref.snapshotText}</p>;
}
