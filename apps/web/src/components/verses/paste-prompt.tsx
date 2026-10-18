import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
import { translationLabel } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import { cn } from 'cn';
import { X } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { useKeyboardInset } from '@/lib/use-keyboard.ts';
import { useMediaQuery } from '@/lib/use-media-query.ts';
import {
  dismissPaste,
  makePasteChips,
  type PastePrompt,
  type PlacedChip,
  usePastePrompt,
} from './paste-chips.ts';
import { LAPTOP_QUERY } from './verse-suggestions.tsx';

const chipName = (chip: PlacedChip) => `${chip.ref.display} · ${translationLabel(chip.ref)}`;

/**
 * The paste prompt (F19, M9-08, wireframes/interop.md): the chips a paste could make, with Make
 * chip for one, or Make N chips and Choose… for several. One for the page, for the note pasted into
 * last. It never takes focus, so typing goes on and a phone's keyboard stays open; Alt+Enter makes
 * the chips and Escape keeps the paste as it is.
 */
export function PasteChipsPrompt() {
  const prompt = usePastePrompt();
  if (!prompt) return null;
  // A new paste starts over, with the list folded.
  return <Prompt key={prompt.id} prompt={prompt} />;
}

function Prompt({ prompt }: { prompt: PastePrompt }) {
  const { editor, chips } = prompt;
  const laptop = useMediaQuery(LAPTOP_QUERY);
  const keyboard = useKeyboardInset();
  const element = useRef<HTMLElement>(null);
  const [choosing, setChoosing] = useState(false);

  // On a laptop it hangs under the end of the paste, and follows it as the page scrolls.
  useLayoutEffect(() => {
    const floating = element.current;
    if (!laptop || !floating) return;
    const reference = {
      getBoundingClientRect: () => {
        const end = Math.min(prompt.end, editor.state.doc.content.size);
        const { left, top, bottom } = editor.view.coordsAtPos(end);
        return { x: left, y: top, left, top, bottom, right: left, width: 0, height: bottom - top };
      },
      contextElement: editor.view.dom,
    };
    return autoUpdate(reference, floating, () => {
      void computePosition(reference, floating, {
        strategy: 'fixed',
        placement: 'bottom-start',
        middleware: [offset(8), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => Object.assign(floating.style, { left: `${x}px`, top: `${y}px` }));
    });
  }, [laptop, editor, prompt.end]);

  // On a phone: just above the editing toolbar, which sits on the keyboard when it's open.
  const toolbar = laptop ? null : document.querySelector('[role="toolbar"][aria-label="Editing"]');
  const bottom = toolbar
    ? window.innerHeight - toolbar.getBoundingClientRect().top + 4
    : keyboard + 8;

  const one = chips.length === 1 ? chips[0]! : null;
  const summary = one
    ? one.matchedOnly
      ? `This is ${one.ref.display} (${translationLabel(one.ref)}).`
      : chipName(one)
    : `${chips.length} references found`;

  return (
    // Its presses are kept from the note's focus, not handled: the buttons inside do the work.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      ref={element}
      aria-label="Verse chips"
      style={laptop ? undefined : { bottom }}
      className={cn(
        'fixed z-50 flex flex-col gap-2 rounded-lg bg-popover p-3 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10',
        laptop ? 'top-0 left-0 w-80' : 'inset-x-2',
      )}
      // A tap or click doesn't take focus from the note (or close the keyboard).
      onPointerDown={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="flex items-start justify-between gap-2">
        <output aria-live="polite" className="pt-1.5 font-medium">
          {summary}
        </output>
        <Button
          variant="ghost"
          size="icon-sm"
          className="pointer-coarse:size-11"
          aria-label="Keep the paste as it is"
          tabIndex={-1}
          onClick={() => dismissPaste(editor)}
        >
          <X />
        </Button>
      </div>
      {choosing ? (
        <ul aria-label="Chips found" className="flex flex-col gap-1">
          {chips.map((chip) => (
            <li
              key={`${chip.at.from}:${chip.ref.display}`}
              className="flex items-center justify-between gap-2"
            >
              <span>{chipName(chip)}</span>
              <Button
                size="sm"
                variant="outline"
                className="pointer-coarse:min-h-11"
                tabIndex={-1}
                aria-label={`Make chip for ${chip.ref.display}`}
                onClick={() => makePasteChips(editor, [chip])}
              >
                Make chip
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="pointer-coarse:min-h-11"
            tabIndex={-1}
            onClick={() => makePasteChips(editor, chips)}
          >
            {one ? 'Make chip' : `Make ${chips.length} chips`}
          </Button>
          {!one && (
            <Button
              size="sm"
              variant="outline"
              className="pointer-coarse:min-h-11"
              tabIndex={-1}
              onClick={() => setChoosing(true)}
            >
              Choose…
            </Button>
          )}
        </div>
      )}
      <p aria-hidden className="hidden text-xs text-muted-foreground pointer-fine:block">
        Alt+Enter make · Esc keep
      </p>
    </section>
  );
}
