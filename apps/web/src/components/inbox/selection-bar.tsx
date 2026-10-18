import type { InboxItem } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@lamp/ui/components/dropdown-menu';
import { Ellipsis, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSetSelectionBarOpen } from '@/components/shell/selection-bar-open.tsx';
import type { Selection } from './inbox-list.tsx';
import { SnoozeMenu } from './triage-dialogs.tsx';
import { useTriage } from './use-triage.tsx';

/** Selecting items for a bulk action (M11-02), on the inbox or an import's screen. */
export function useInboxSelection(items: readonly InboxItem[]) {
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  // An item placed, dismissed or snoozed meanwhile (here or on another device) drops out.
  const selected = useMemo(() => items.filter((item) => picked.has(item.id)), [items, picked]);
  const selection: Selection | null = useMemo(
    () =>
      selecting
        ? {
            ids: new Set(selected.map((item) => item.id)),
            toggle: (id) =>
              setPicked((ids) => {
                const next = new Set(ids);
                if (!next.delete(id)) next.add(id);
                return next;
              }),
          }
        : null,
    [selecting, selected],
  );
  return {
    selection,
    selected,
    /** "Select", or holding an item, which starts with it ticked. */
    start: (id?: string) => {
      setSelecting(true);
      setPicked(new Set(id ? [id] : []));
    },
    stop: () => {
      setSelecting(false);
      setPicked(new Set());
    },
    selectAll: () => setPicked(new Set(items.map((item) => item.id))),
    clear: () => setPicked(new Set()),
  };
}

/**
 * The bar that replaces the bottom navigation while selecting (wireframes/sermon.md "Inbox
 * triage"), as the reader's does: `✕ 3 selected · Select all`, then Send to lesson, Tag, Dismiss
 * and `⋯` with Make a lesson and Snooze. On a laptop it sits at the bottom of the window, to the
 * right of the sidebar. Each action is one write with one Undo.
 */
export function InboxSelectionBar({
  selected,
  total,
  onSelectAll,
  onClear,
  onClose,
}: {
  selected: readonly InboxItem[];
  /** How many items could be selected. */
  total: number;
  onSelectAll: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const setBarOpen = useSetSelectionBarOpen();
  useEffect(() => {
    setBarOpen(true);
    return () => setBarOpen(false);
  }, [setBarOpen]);
  const triage = useTriage(selected, onClose);
  const none = selected.length === 0;
  const all = selected.length === total && total > 0;

  return (
    <div
      role="toolbar"
      aria-label="Selected items"
      data-slot="selection-bar"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:left-60"
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-1 px-4 py-2 lg:px-0">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Stop selecting"
            onClick={onClose}
            className="pointer-coarse:size-11"
          >
            <X />
          </Button>
          <p className="min-w-0 flex-1 truncate text-sm font-medium" aria-live="polite">
            {selected.length} selected
          </p>
          <Button
            variant="ghost"
            onClick={all ? onClear : onSelectAll}
            className="pointer-coarse:min-h-11"
          >
            {all ? 'Select none' : 'Select all'}
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            disabled={none}
            onClick={() => triage.open('send')}
            className="pointer-coarse:min-h-11"
          >
            Send to lesson
          </Button>
          <Button
            variant="ghost"
            disabled={none}
            onClick={() => triage.open('tag')}
            className="pointer-coarse:min-h-11"
          >
            Tag
          </Button>
          <Button
            variant="ghost"
            disabled={none}
            onClick={triage.dismiss}
            className="pointer-coarse:min-h-11"
          >
            Dismiss
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={none}
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="More for the selected items"
                  className="ml-auto pointer-coarse:size-11"
                />
              }
            >
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => triage.open('lesson')}>
                Make a lesson…
              </DropdownMenuItem>
              <SnoozeMenu onSnooze={triage.snooze} onPickDate={() => triage.open('snooze-date')} />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {triage.dialogs}
    </div>
  );
}
