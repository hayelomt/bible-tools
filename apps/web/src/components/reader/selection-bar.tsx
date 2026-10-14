import { HIGHLIGHT_COLOURS, formatPassage, type Highlight } from '@lamp/domain';
import { buttonVariants } from '@lamp/ui/components/button';
import { X } from 'lucide-react';
import { useKeyboardInset } from '@/lib/use-keyboard.ts';
import { selectionPassage, type VerseSelection } from '@/lib/highlights.ts';
import type { Chapter } from '@/lib/chapters.ts';
import { HIGHLIGHT_COLOUR_CLASS, HIGHLIGHT_COLOUR_NAME } from './colours.ts';

/**
 * The bar that replaces the bottom navigation while verses are selected (wireframes/reader.md
 * "Selected verses"): four colours, a note, and Remove once those verses are a highlight. On a
 * laptop it sits at the bottom of the window, to the right of the sidebar.
 */
export function SelectionBar({
  at,
  selection,
  exact,
  noting,
  onPaint,
  onNote,
  onRemove,
  onClear,
}: {
  at: Chapter;
  selection: VerseSelection;
  exact: Highlight | null;
  noting: boolean;
  onPaint: (colour: Highlight['colour']) => void;
  onNote: () => void;
  onRemove: () => void;
  onClear: () => void;
}) {
  const keyboard = useKeyboardInset();
  if (keyboard > 0) return null;
  const label = formatPassage(selectionPassage(at, selection));
  return (
    <div
      role="toolbar"
      aria-label="Selected verses"
      data-slot="selection-bar"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:left-60"
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-1 px-4 py-2 lg:px-0">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-medium">{label} selected</p>
          <button
            type="button"
            aria-label="Clear selection"
            onClick={onClear}
            data-slot="button"
            className={buttonVariants({
              variant: 'ghost',
              size: 'icon',
              className: 'pointer-coarse:size-11',
            })}
          >
            <X />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <fieldset className="flex gap-1.5 border-0 p-0">
            <legend className="sr-only">Highlight colour</legend>
            {HIGHLIGHT_COLOURS.map((colour) => (
              <button
                key={colour}
                type="button"
                aria-label={HIGHLIGHT_COLOUR_NAME[colour]}
                aria-pressed={exact?.colour === colour}
                onClick={() => onPaint(colour)}
                className={`inline-flex size-8 items-center justify-center rounded-full text-xs font-semibold text-foreground outline-none ring-offset-2 ring-offset-background focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:ring-2 aria-pressed:ring-ring pointer-coarse:size-11 ${HIGHLIGHT_COLOUR_CLASS[colour]}`}
              >
                <span aria-hidden>{HIGHLIGHT_COLOUR_NAME[colour][0]}</span>
              </button>
            ))}
          </fieldset>
          <button
            type="button"
            aria-expanded={noting}
            onClick={onNote}
            data-slot="button"
            className={buttonVariants({
              variant: 'ghost',
              className: 'pointer-coarse:min-h-11',
            })}
          >
            Note
          </button>
          {exact && (
            <button
              type="button"
              onClick={onRemove}
              data-slot="button"
              className={buttonVariants({
                variant: 'ghost',
                className: 'pointer-coarse:min-h-11',
              })}
            >
              Remove highlight
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
