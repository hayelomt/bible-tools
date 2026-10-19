import { cn } from 'cn';
import { type CSSProperties, type RefObject, useLayoutEffect, useRef, useState } from 'react';
import { type FitLayout, fitStep, type Handout, lastFitStep } from '@/export/handout.ts';

/**
 * The handout's page (F33, M12-05, wireframes/reflection.md "Handout"): a box the size of what A4
 * and Letter both hold inside the print margins (`print.css`), 178 × 242 mm, which nothing runs
 * out of. It's fitted by measuring: the steps of `fitStep` in turn until its content fits. On
 * screen it's drawn as a sheet of paper, scaled down to fit a narrow window.
 */

/** The paper on screen: the box and the print margins around it. */
const PAPER = { width: 210, height: 278 };
const MM = 96 / 25.4;

/**
 * Fits the handout: the first step whose content doesn't overflow the box, measured before each
 * paint, so the steps on the way are never seen. Starts again when the content changes, or once
 * the fonts are in, which changes the type's measure. `settled` is false until the step is found.
 */
export function useHandoutFit(handout: Handout): {
  box: RefObject<HTMLDivElement | null>;
  layout: FitLayout;
  settled: boolean;
} {
  const box = useRef<HTMLDivElement>(null);
  const [fonts, setFonts] = useState(false);
  useLayoutEffect(() => {
    let live = true;
    void document.fonts.ready.then(() => live && setFonts(true));
    return () => {
      live = false;
    };
  }, []);
  const key = `${fonts}:${JSON.stringify(handout)}`;
  const [fit, setFit] = useState({ key, step: 0, settled: false });
  const current = fit.key === key ? fit : { key, step: 0, settled: false };
  const last = lastFitStep(handout);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el || current.settled) return;
    const over = el.scrollHeight > el.clientHeight + 1;
    setFit(
      over && current.step < last
        ? { key, step: current.step + 1, settled: false }
        : { key, step: current.step, settled: fonts },
    );
  }, [key, current.step, current.settled, last, fonts]);

  return { box, layout: fitStep(handout, current.step), settled: current.settled };
}

/** How much the sheet is drawn smaller on screen, to fit the window's width. */
function useSheetScale() {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => setScale(Math.min(1, el.clientWidth / (PAPER.width * MM)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { frame, scale };
}

export function HandoutSheet({
  handout,
  layout,
  box,
}: {
  handout: Handout;
  layout: FitLayout;
  box: RefObject<HTMLDivElement | null>;
}) {
  const { frame, scale } = useSheetScale();
  const notes = handout.notes.slice(0, handout.notes.length - layout.leftOut.notes);
  const questions = handout.questions.slice(0, handout.questions.length - layout.leftOut.questions);
  const takeaways = handout.takeaways.slice(0, handout.takeaways.length - layout.leftOut.takeaways);
  const sub = 'mt-[0.9em] mb-[0.3em] font-sans text-[0.8em] font-semibold tracking-wide uppercase';

  return (
    <div
      ref={frame}
      className="handout-frame w-full"
      style={{ height: `${PAPER.height * MM * scale}px` }}
    >
      <div
        className="handout-paper bg-white text-neutral-900 shadow-md"
        style={{ '--sheet-scale': scale } as CSSProperties}
      >
        <div
          ref={box}
          data-testid="handout"
          className="handout-box overflow-hidden leading-snug"
          style={{ fontSize: `${layout.size}pt` }}
        >
          <header className="flex flex-col gap-[0.2em]">
            <h1 className="text-[1.8em] leading-tight font-semibold break-words">
              {handout.title}
            </h1>
            {handout.details.map((line) => (
              <p key={line} className="font-sans text-[0.85em] break-words text-neutral-600">
                {line}
              </p>
            ))}
          </header>

          {handout.passages.length > 0 && (
            <section aria-label="Passages" className="mt-[0.9em] flex flex-col gap-[0.5em]">
              {handout.passages.map((passage, i) => (
                <div key={i}>
                  <p className="font-semibold">{passage.label}</p>
                  {layout.passageText && passage.verses && (
                    <p className="text-[0.85em] text-neutral-800">
                      {passage.verses.map((v, j) => (
                        <span key={v.label}>
                          {j > 0 && ' '}
                          <sup className="relative -top-[0.4em] mr-0.5 align-baseline font-sans text-[0.65em] leading-none text-neutral-500">
                            {v.label}
                          </sup>
                          {v.text}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              ))}
            </section>
          )}

          {notes.length > 0 && (
            <section aria-labelledby="handout-notes">
              <h2 id="handout-notes" className={sub}>
                Notes
              </h2>
              <ol
                className={cn(
                  'list-decimal pl-[1.6em]',
                  layout.columns === 2 && 'columns-2 gap-x-[2em]',
                )}
              >
                {notes.map((note, i) => (
                  <li key={i} className="pl-[0.2em] break-inside-avoid">
                    <span className="line-clamp-2 break-words">{note}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {takeaways.length > 0 && (
            <section aria-labelledby="handout-takeaways">
              <h2 id="handout-takeaways" className={sub}>
                Takeaways
              </h2>
              <ul className="list-disc pl-[1.6em]">
                {takeaways.map((t, i) => (
                  <li key={i} className="pl-[0.2em] break-words">
                    {t}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {questions.length > 0 && (
            <section aria-labelledby="handout-questions">
              <h2 id="handout-questions" className={sub}>
                Questions
              </h2>
              <ul className="flex flex-col">
                {questions.map((q) => (
                  <li key={q.id} className="flex gap-[0.5em] break-words">
                    <span aria-hidden className="font-sans">
                      {q.status === 'answered' ? '☑' : '☐'}
                    </span>
                    <span className="min-w-0">
                      <span className="sr-only">
                        {q.status === 'answered' ? 'Answered: ' : 'Open: '}
                      </span>
                      {q.text}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <footer className="mt-[1.2em] border-t border-neutral-300 pt-[0.4em] font-sans text-[0.75em] text-neutral-600">
            {handout.credit}
          </footer>
        </div>
      </div>
    </div>
  );
}
