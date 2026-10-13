import {
  type Announcements,
  type DndContextProps,
  type DragMoveEvent,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Drop, dropAt, movingRows } from './outline.ts';
import type { SectionRow } from './section-list.tsx';

/** A drag in progress: the section, and where it would land, if anywhere. */
export interface DragState {
  id: string;
  drop: Drop | null;
}

/** A finger must rest this long on the handle before it drags; moving sooner scrolls the page. */
const HOLD_MS = 250;
/** A mouse drags once it has moved this far, so a click still opens the menu. */
const MOUSE_SLOP_PX = 4;
const TOUCH_SLOP_PX = 8;
/** Half a reply's indent: a section pulled this far right lands as a reply. */
const REPLY_PX = 12;

interface Options {
  /** The element holding the rows; the dragged section's left edge is measured against it. */
  list: RefObject<HTMLElement | null>;
  rows: readonly SectionRow[];
  /** The empty section waiting at the end, if any: it doesn't move and nothing lands below it. */
  trailingId: string | undefined;
  onDrop: (id: string, drop: Drop) => void;
}

const announcements: Announcements = {
  onDragStart: () => 'Picked up a section.',
  onDragOver: () => undefined,
  onDragEnd: ({ over }) => (over ? 'Section moved.' : 'Section put back.'),
  onDragCancel: () => 'Moving cancelled.',
};

/**
 * Dragging a section by its handle (wireframes/lessons.md), with dnd-kit: the section follows the
 * pointer as a card, the other rows make room, and a slot shows where it will land. The slot's
 * order comes from the sortable list; pulling the card right makes it a reply, within the
 * two-level rules of `dropAt`. A section's replies go with it, folded away while it's dragged.
 * Escape cancels.
 */
export function useSectionDrag({ list, rows, trailingId, onDrop }: Options) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragged = useRef(false);
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  });

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_SLOP_PX } }),
    useSensor(TouchSensor, { activationConstraint: { delay: HOLD_MS, tolerance: TOUCH_SLOP_PX } }),
  );

  // The sortable rows: all but the empty section at the end and the dragged section's replies.
  const items = useMemo(() => {
    const folded = drag ? movingRows(rows, drag.id).filter((r) => r.item.id !== drag.id) : [];
    return rows
      .filter((r) => r.item.id !== trailingId && !folded.includes(r))
      .map((r) => r.item.id);
  }, [rows, trailingId, drag]);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });

  /** Where the section would land, from the row it's over and how far right the card is. */
  const project = useCallback(
    ({ active, over }: Pick<DragMoveEvent, 'active' | 'over'>): Drop | null => {
      const id = String(active.id);
      const all = rowsRef.current;
      const ids = itemsRef.current;
      const from = ids.indexOf(id);
      const to = over ? ids.indexOf(String(over.id)) : from;
      if (from < 0 || to < 0) return null;
      // The rows left once the section is lifted out are `ids` without it, so its index is the gap.
      const gap = arrayMove(ids, from, to).indexOf(id);
      const left = active.rect.current.translated?.left ?? 0;
      const box = list.current?.getBoundingClientRect();
      const reply = box !== undefined && left - box.left >= REPLY_PX;
      return dropAt(all, id, gap, reply);
    },
    [list],
  );

  const update = useCallback(
    (event: Pick<DragMoveEvent, 'active' | 'over'>) => {
      const drop = project(event);
      const id = String(event.active.id);
      setDrag((current) =>
        current?.id === id &&
        current.drop?.parent === drop?.parent &&
        current.drop?.after === drop?.after &&
        current.drop?.level === drop?.level
          ? current
          : { id, drop },
      );
    },
    [project],
  );

  const settle = () => {
    document.documentElement.classList.remove('select-none');
    // After the click that ends the press, which mustn't open the menu.
    setTimeout(() => {
      dragged.current = false;
    }, 0);
  };

  const context: DndContextProps = {
    sensors,
    collisionDetection: closestCenter,
    // Rows change height as replies fold away and as the slot moves between levels.
    measuring: { droppable: { strategy: MeasuringStrategy.Always } },
    accessibility: { announcements },
    onDragStart: ({ active }) => {
      dragged.current = true;
      document.documentElement.classList.add('select-none');
      setDrag({ id: String(active.id), drop: null });
    },
    onDragMove: update,
    onDragOver: update,
    onDragEnd: (event) => {
      settle();
      const drop = project(event);
      setDrag(null);
      if (drop) onDrop(String(event.active.id), drop);
    },
    onDragCancel: () => {
      settle();
      setDrag(null);
    },
  };

  /** Whether the press that just ended was a drag (so its click doesn't open the menu). */
  const wasDragged = useCallback(() => dragged.current, []);

  return { context, items, drag, wasDragged };
}
