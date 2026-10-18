import type { InboxItem } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@lamp/ui/components/dialog';
import { type ReactNode, useEffect, useEffectEvent, useState } from 'react';
import { SidePanel } from '@/components/shell/slots.tsx';
import { inboxItemTitle } from '@/data/actions/inbox.ts';
import { isTyping } from '@/lib/is-typing.ts';
import { useMediaQuery } from '@/lib/use-media-query.ts';
import { useToday } from '@/lib/use-today.ts';
import { ChipLine, itemMeta } from './inbox-list.tsx';
import type { useInboxSelection } from './selection-bar.tsx';
import { dismissItems } from './triage-actions.ts';
import { type TriageDialog, useTriage } from './use-triage.tsx';

/** An action's key, its words in the key list, and its button's in the side panel. */
interface ActionKey {
  key: string;
  does: string;
  button: string;
  /** Acts on the selected items while there are any; else on the current item alone. */
  bulk: boolean;
  dialog: TriageDialog | 'dismiss';
}

/** The actions' keys (wireframes/sermon.md "Inbox keys"), in the side panel's order. */
const ACTIONS: readonly ActionKey[] = [
  { key: 's', does: 'send to lesson', button: 'Send to lesson', bulk: true, dialog: 'send' },
  { key: 'a', does: 'append to a section', button: 'Append', bulk: false, dialog: 'append' },
  { key: 'w', does: 'make a takeaway', button: 'Takeaway', bulk: false, dialog: 'takeaway' },
  { key: 'q', does: 'make a question', button: 'Question', bulk: false, dialog: 'question' },
  { key: 't', does: 'tag', button: 'Tag', bulk: true, dialog: 'tag' },
  { key: 'z', does: 'snooze', button: 'Snooze', bulk: true, dialog: 'snooze-date' },
  { key: 'd', does: 'dismiss', button: 'Dismiss', bulk: true, dialog: 'dismiss' },
];
const MAKE_LESSON: ActionKey = {
  key: 'l',
  does: 'make a lesson from the selected items',
  button: 'Make a lesson',
  bulk: true,
  dialog: 'lesson',
};

/** The key list behind `?`, in the wireframe's order. */
const KEY_LIST: readonly [keys: string[], does: string][] = [
  [['j', 'k', '↓', '↑'], 'next, previous item'],
  [['x'], 'select it'],
  ...[...ACTIONS, MAKE_LESSON].map((a): [string[], string] => [[a.key], a.does]),
  [['Shift+x'], 'select all'],
  [['Esc'], 'stop selecting'],
  [['?'], 'this list'],
];

const BY_KEY = new Map([...ACTIONS, MAKE_LESSON].map((a) => [a.key, a]));

/** The side panel needs room for the sidebar, the column and itself, as the lesson's does. */
const WIDE = '(min-width: 80rem)';

/** Where the keys are: an item's id, and its place, so the next item takes over when it goes. */
interface Cursor {
  id: string;
  index: number;
}

/** The current item: the cursor's, or the one now in its place once it's gone. */
function resolve(cursor: Cursor | null, items: readonly InboxItem[]): InboxItem | null {
  if (!cursor || items.length === 0) return null;
  return (
    items.find((item) => item.id === cursor.id) ??
    items[Math.min(cursor.index, items.length - 1)] ??
    null
  );
}

const rowOf = (id: string) =>
  document.querySelector<HTMLElement>(`[data-inbox-item="${CSS.escape(id)}"]`);

/** Not while typing, nor in a dialog, a menu or a list of choices: those have their own keys. */
function forTheList(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return false;
  if (isTyping(event.target)) return false;
  const target = event.target instanceof Element ? event.target : null;
  return !target?.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]');
}

/**
 * The inbox's keys on a laptop (F27, M11-05, wireframes/sermon.md "Laptop"): `j` `k` move a focus
 * ring through the items, a letter acts on the current item (or on the selected ones), and after
 * an action the next item is current, so the whole inbox can be cleared without a mouse. On a wide
 * laptop the side panel shows the current item with every action as a button and its key; `?`
 * lists the keys. Gives the list its current item, and the dialogs and panel to render.
 */
export function useInboxKeys(
  items: readonly InboxItem[],
  select: ReturnType<typeof useInboxSelection>,
): { current: string | null; onCurrent: (id: string) => void; ui: ReactNode } {
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [target, setTarget] = useState<{ items: readonly InboxItem[]; bulk: boolean }>({
    items: [],
    bulk: false,
  });
  const [help, setHelp] = useState(false);
  const triage = useTriage(target.items, target.bulk ? select.stop : undefined);
  const wide = useMediaQuery(WIDE);
  const current = resolve(cursor, items);
  const currentId = current?.id ?? null;

  const point = (id: string) => setCursor({ id, index: items.findIndex((i) => i.id === id) });
  const moveTo = (index: number) => {
    const item = items[Math.max(0, Math.min(index, items.length - 1))];
    if (!item) return;
    point(item.id);
    rowOf(item.id)?.focus();
  };

  const act = (action: ActionKey, item: InboxItem | null = current) => {
    const selected = select.selection ? select.selected : [];
    const bulk = action.bulk && selected.length > 0;
    const on = bulk ? selected : item ? [item] : [];
    if (on.length === 0) return;
    if (action.dialog === 'dismiss') {
      if (bulk) select.stop();
      dismissItems(on.map((i) => i.id));
      return;
    }
    setTarget({ items: on, bulk });
    triage.open(action.dialog);
  };

  // Added once; it reads this render's items and selection.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (!forTheList(event)) return;
    const index = current ? items.indexOf(current) : -1;
    const key = event.key;
    if (key === 'j' || key === 'ArrowDown') moveTo(index + 1);
    else if (key === 'k' || key === 'ArrowUp') moveTo(index === -1 ? 0 : index - 1);
    else if (key === 'x' && current) {
      if (select.selection) select.selection.toggle(current.id);
      else select.start(current.id);
    } else if (key === 'X') {
      if (!select.selection) select.start();
      select.selectAll();
    } else if (key === 'Escape' && select.selection) select.stop();
    else if (key === '?') setHelp(true);
    else {
      const action = BY_KEY.get(key);
      if (!action) return;
      act(action);
    }
    event.preventDefault();
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);

  // Focus comes back to the current item when nothing else has it: after a dialog closes (an item
  // can't be tabbed to, so the dialog doesn't return focus to it), and when the item acted on went
  // and the one now in its place is current. Not from the add box, which has it on purpose.
  const dialogOpen = triage.dialog !== null || help;
  useEffect(() => {
    if (dialogOpen || !currentId) return;
    let frame = 0;
    let frames = 0;
    const back = () => {
      // A dialog closing keeps focus until it's gone.
      if (document.querySelector('[role="dialog"]') && frames++ < 60) {
        frame = requestAnimationFrame(back);
        return;
      }
      const active = document.activeElement;
      if (!active || active === document.body) rowOf(currentId)?.focus();
    };
    frame = requestAnimationFrame(back);
    return () => cancelAnimationFrame(frame);
  }, [dialogOpen, currentId]);

  const shown = current ?? items[0] ?? null;
  const ui = (
    <>
      {triage.dialogs}
      <KeysDialog open={help} onOpenChange={setHelp} />
      {wide && shown && (
        <SidePanel>
          <TriagePanel
            item={shown}
            selecting={select.selection !== null && select.selected.length > 0}
            onAct={(action) => act(action, shown)}
            onKeys={() => setHelp(true)}
          />
        </SidePanel>
      )}
    </>
  );
  return { current: currentId, onCurrent: point, ui };
}

/**
 * The current item on a wide laptop: the chip and its text, how it came, and every action as a
 * button with its key. While items are selected, the actions that take several act on them.
 */
function TriagePanel({
  item,
  selecting,
  onAct,
  onKeys,
}: {
  item: InboxItem;
  selecting: boolean;
  onAct: (action: ActionKey) => void;
  onKeys: () => void;
}) {
  const day = useToday();
  return (
    <section aria-label={`Current item: ${inboxItemTitle(item)}`} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5 break-words">
        {item.ref && <ChipLine verse={item.ref} />}
        {item.text && <p className="line-clamp-[12] whitespace-pre-line">{item.text}</p>}
        <p className="text-sm text-muted-foreground">{itemMeta(item, day)}</p>
      </div>
      <div className="flex flex-col gap-1">
        {ACTIONS.map((action) => (
          <Button
            key={action.key}
            variant="outline"
            aria-keyshortcuts={action.key}
            disabled={selecting && !action.bulk}
            onClick={() => onAct(action)}
            className="justify-between"
          >
            {action.button}
            <kbd className="font-sans text-xs text-muted-foreground">{action.key}</kbd>
          </Button>
        ))}
      </div>
      <button
        type="button"
        onClick={onKeys}
        aria-keyshortcuts="?"
        className="self-start rounded-md px-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Inbox keys <kbd className="font-sans">?</kbd>
      </button>
    </section>
  );
}

/** `?`: the inbox's keys. */
function KeysDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inbox keys</DialogTitle>
          <DialogDescription>Not while typing in the add box.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
          {KEY_LIST.map(([keys, does]) => (
            <div key={does} className="contents">
              <dt className="flex items-start gap-1.5">
                {keys.map((key) => (
                  <kbd key={key} className="rounded border px-1.5 font-sans">
                    {key}
                  </kbd>
                ))}
              </dt>
              <dd>{does}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
