import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { OpenInTarget } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@lamp/ui/components/dropdown-menu';
import { Switch } from '@lamp/ui/components/switch';
import { createFileRoute } from '@tanstack/react-router';
import { cn } from 'cn';
import { GripVertical } from 'lucide-react';
import { useRef, useState } from 'react';
import { changeOpenInTargets } from '@/data/actions/settings.ts';
import { useSettings } from '@/data/use-settings.ts';
import { allTargets, moveShown, setShown } from '@/open-in/order.ts';
import { useOpenInTable } from '@/open-in/table.ts';
import { runWrite } from '@/lib/run-write.ts';

export const Route = createFileRoute('/_app/settings/open-in')({
  staticData: { title: 'Open in', back: '/settings' },
  component: OpenInSettings,
});

/** As for sections: a finger rests on the handle before it drags; a mouse moves a little. */
const HOLD_MS = 250;
const MOUSE_SLOP_PX = 4;
const TOUCH_SLOP_PX = 8;

const save = (change: (shown: readonly OpenInTarget[]) => OpenInTarget[]) =>
  runWrite(changeOpenInTargets(change), 'the Open in setting');

/** A shown target dropped on another takes its place. */
function onDragEnd({ active, over }: DragEndEvent) {
  if (!over || active.id === over.id) return;
  save((now) => moveShown(now, active.id as OpenInTarget, now.indexOf(over.id as OpenInTarget)));
}

/**
 * Settings → Open in (F20, M9-10, wireframes/interop.md): each target with a switch, and the shown
 * ones in the order the verse sheet lists them. `⠿` drags, or opens Move up and Move down. Synced.
 */
function OpenInSettings() {
  const settings = useSettings();
  const table = useOpenInTable();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_SLOP_PX } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: HOLD_MS, tolerance: TOUCH_SLOP_PX },
    }),
  );
  if (!settings) return null;
  const shown = settings.openInTargets;
  const nameOf = (key: OpenInTarget) =>
    table.targets.find((target) => target.key === key)?.name ?? key;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground">Shown in the verse sheet, in this order.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={shown} strategy={verticalListSortingStrategy}>
          <ul data-slot="row-list" className="flex flex-col divide-y rounded-xl border">
            {allTargets(shown).map((key) => {
              const index = shown.indexOf(key);
              return (
                <TargetRow
                  key={key}
                  target={key}
                  name={nameOf(key)}
                  index={index}
                  count={shown.length}
                  onShow={(on) => save((now) => setShown(now, key, on))}
                  onMove={(to) => save((now) => moveShown(now, key, to))}
                />
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

interface TargetRowProps {
  target: OpenInTarget;
  name: string;
  /** Its place among the shown targets; -1 when hidden. */
  index: number;
  count: number;
  onShow: (on: boolean) => void;
  onMove: (index: number) => void;
}

function TargetRow({ target, name, index, count, onShow, onMove }: TargetRowProps) {
  const shown = index >= 0;
  const { setNodeRef, setActivatorNodeRef, listeners, transform, transition, isDragging } =
    useSortable({ id: target, disabled: !shown });
  const handle = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const label = `${name}, ${shown ? `shown, ${index + 1} of ${count}` : 'hidden'}`;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'flex min-h-14 items-center gap-3 bg-card px-4',
        isDragging && 'relative z-10 shadow-md',
      )}
    >
      <span className={cn('flex-1', !shown && 'text-muted-foreground')}>{name}</span>
      <Switch aria-label={`Show ${name}`} checked={shown} onCheckedChange={onShow} />
      {shown ? (
        <>
          <Button
            ref={(element) => {
              handle.current = element;
              setActivatorNodeRef(element);
            }}
            variant="ghost"
            size="icon"
            aria-label={`Move ${label}`}
            aria-haspopup="menu"
            aria-expanded={open}
            title="Drag to move, or click for actions"
            className="cursor-grab touch-pan-y text-muted-foreground select-none pointer-coarse:size-11"
            {...listeners}
            onClick={() => setOpen(true)}
          >
            <GripVertical />
          </Button>
          <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuContent anchor={handle} align="end" className="w-40">
              <DropdownMenuItem disabled={index === 0} onClick={() => onMove(index - 1)}>
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem disabled={index === count - 1} onClick={() => onMove(index + 1)}>
                Move down
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : (
        // Nothing to move: the space keeps the switches in line.
        <div aria-hidden className="size-8 shrink-0 pointer-coarse:size-11" />
      )}
    </li>
  );
}
