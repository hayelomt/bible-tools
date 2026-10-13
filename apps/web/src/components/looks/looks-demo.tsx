import { useState } from 'react';
import { FolioLook } from './folio.tsx';
import { GridLook } from './grid.tsx';
import { LamplightLook } from './lamplight.tsx';
import { SoftLook } from './soft.tsx';
import './looks.css';

const LOOKS = [
  {
    id: 'folio',
    name: 'Folio',
    pitch: 'A printed study Bible: display serif, hairline rules, small capitals, one vermilion.',
    Look: FolioLook,
  },
  {
    id: 'soft',
    name: 'Soft',
    pitch: 'Tactile paper cards on a warm wash, a floating glass dock, sticky-note takeaways.',
    Look: SoftLook,
  },
  {
    id: 'lamplight',
    name: 'Lamplight',
    pitch: 'A dark study by one lamp: glass panels with lit edges, amber glow, mono references.',
    Look: LamplightLook,
  },
  {
    id: 'grid',
    name: 'Grid',
    pitch: 'Swiss and a little brutal: huge numerals, mono labels, ink borders, hard shadows.',
    Look: GridLook,
  },
] as const;

type LookId = (typeof LOOKS)[number]['id'];

/**
 * Look and feel explorations: the same lessons home, lesson section and passage in four visual
 * directions, to choose a way past the stock shadcn look before restyling packages/ui.
 */
export function LooksDemo() {
  const [id, setId] = useState<LookId>(() => {
    const hash = location.hash.slice(1);
    return LOOKS.some((l) => l.id === hash) ? (hash as LookId) : 'folio';
  });
  const current = LOOKS.find((l) => l.id === id)!;

  function choose(next: LookId) {
    setId(next);
    history.replaceState(null, '', `#${next}`);
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-b bg-background/90 px-4 py-2.5 backdrop-blur lg:px-6">
        <h1 className="text-sm font-semibold">Look and feel</h1>
        <fieldset className="flex gap-1 rounded-lg bg-muted p-1">
          <legend className="sr-only">Direction</legend>
          {LOOKS.map((l) => (
            <label
              key={l.id}
              className="relative flex h-7 cursor-pointer items-center rounded-md px-3 text-sm text-muted-foreground hover:text-foreground has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50 pointer-coarse:min-h-11"
            >
              <input
                type="radio"
                name="look"
                value={l.id}
                checked={id === l.id}
                onChange={() => choose(l.id)}
                className="absolute inset-0 cursor-pointer appearance-none opacity-0"
              />
              {l.name}
            </label>
          ))}
        </fieldset>
        <p className="text-sm text-muted-foreground">{current.pitch}</p>
      </header>
      <div className="flex-1">
        <current.Look />
      </div>
    </div>
  );
}
