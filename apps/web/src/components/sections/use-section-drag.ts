import { type PointerEvent, type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { type Drop, dropAt, movingRows } from './outline.ts';
import type { SectionRow } from './section-list.tsx';

/** A drag in progress: the section, and the line showing where it would land, if anywhere. */
export interface DragState {
  id: string;
  line: { top: number; level: 0 | 1 } | null;
}

/** A finger must rest this long on the handle before it drags; moving sooner scrolls the page. */
const HOLD_MS = 250;
/** A mouse drags once it has moved this far, so a click still opens the menu. */
const MOUSE_SLOP_PX = 4;
const TOUCH_SLOP_PX = 8;
/** Near the top or bottom of the screen the page scrolls while dragging. */
const SCROLL_EDGE_PX = 72;

interface Options {
  /** The element holding the rows; the line is placed in it (it must be positioned). */
  list: RefObject<HTMLElement | null>;
  rows: RefObject<readonly SectionRow[]>;
  /** The lesson's last row is the empty section waiting at the end: nothing lands below it. */
  hasTrailingDraft: (rows: readonly SectionRow[]) => boolean;
  onDrop: (id: string, drop: Drop) => void;
}

/**
 * Dragging a section by its handle (wireframes/lessons.md), with pointer events, so mouse, pen
 * and touch work the same way. The pointer's height picks the gap between rows, and the right half
 * of the list makes the section a reply, within the two-level rules of `dropAt`. Escape cancels.
 */
export function useSectionDrag({ list, rows, hasTrailingDraft, onDrop }: Options) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragged = useRef(false);
  const stop = useRef<() => void>(undefined);
  useEffect(() => () => stop.current?.(), []);

  const start = useCallback(
    (id: string, event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      stop.current?.();
      dragged.current = false;
      const handle = event.currentTarget;
      const touch = event.pointerType === 'touch';
      const from = { x: event.clientX, y: event.clientY };
      const at = { ...from };
      let started = false;
      let drop: Drop | null = null;
      let frame = 0;

      /** Works out the gap under the pointer and draws the line there. */
      const update = () => {
        const container = list.current;
        const all = rows.current;
        if (!container) return;
        const moving = movingRows(all, id);
        const left = all.filter((r) => !moving.includes(r));
        const rects = left.map((r) =>
          container.querySelector(`[data-section="${r.item.id}"]`)!.getBoundingClientRect(),
        );
        const last = hasTrailingDraft(all) ? left.length - 1 : left.length;
        const gap = Math.min(rects.filter((r) => (r.top + r.bottom) / 2 < at.y).length, last);
        const box = container.getBoundingClientRect();
        drop = dropAt(all, id, gap, at.x > box.left + box.width / 2);
        const above = rects[gap - 1];
        const below = rects[gap];
        // Halfway between the two rows (they're 12 px apart).
        const y = above ? above.bottom + 6 : below ? below.top - 6 : box.top;
        setDrag({ id, line: drop && { top: y - box.top, level: drop.level } });
      };

      const scroll = () => {
        const height = window.visualViewport?.height ?? window.innerHeight;
        const by =
          at.y < SCROLL_EDGE_PX
            ? at.y - SCROLL_EDGE_PX
            : at.y > height - SCROLL_EDGE_PX
              ? at.y - (height - SCROLL_EDGE_PX)
              : 0;
        if (by !== 0) {
          window.scrollBy(0, by / 4);
          update();
        }
        frame = requestAnimationFrame(scroll);
      };

      const begin = () => {
        started = true;
        dragged.current = true;
        if (handle.isConnected) handle.setPointerCapture(event.pointerId);
        document.documentElement.classList.add('select-none');
        update();
        frame = requestAnimationFrame(scroll);
      };

      const hold = touch ? setTimeout(begin, HOLD_MS) : undefined;

      const onMove = (e: globalThis.PointerEvent) => {
        if (e.pointerId !== event.pointerId) return;
        at.x = e.clientX;
        at.y = e.clientY;
        if (started) {
          update();
          return;
        }
        const moved = Math.hypot(at.x - from.x, at.y - from.y);
        // A finger moving before the hold is up is scrolling, not dragging.
        if (touch && moved > TOUCH_SLOP_PX) end();
        else if (!touch && moved > MOUSE_SLOP_PX) begin();
      };
      // Once dragging, a finger mustn't scroll the page as well.
      const onTouchMove = (e: TouchEvent) => {
        if (started && e.cancelable) e.preventDefault();
      };
      const onUp = (e: globalThis.PointerEvent) => {
        if (e.pointerId !== event.pointerId) return;
        const landed = started ? drop : null;
        end();
        if (landed) onDrop(id, landed);
      };
      const onKey = (e: KeyboardEvent) => {
        if (started && e.key === 'Escape') {
          e.preventDefault();
          end();
        }
      };

      const end = () => {
        clearTimeout(hold);
        cancelAnimationFrame(frame);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', end);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('keydown', onKey, true);
        document.documentElement.classList.remove('select-none');
        stop.current = undefined;
        if (started) setDrag(null);
      };
      stop.current = end;

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', end);
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('keydown', onKey, true);
    },
    [list, rows, hasTrailingDraft, onDrop],
  );

  /** Whether the press that just ended was a drag (so its click doesn't open the menu). */
  const wasDragged = useCallback(() => {
    const was = dragged.current;
    dragged.current = false;
    return was;
  }, []);

  return { drag, start, wasDragged };
}
