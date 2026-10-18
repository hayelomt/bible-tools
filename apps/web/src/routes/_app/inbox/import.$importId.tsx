import { Button } from '@lamp/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@lamp/ui/components/dropdown-menu';
import { toast } from '@lamp/ui/components/sonner';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Ellipsis } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog.tsx';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { importDay, importTitle, InboxList } from '@/components/inbox/inbox-list.tsx';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { ScreenActions, ScreenTitle } from '@/components/shell/slots.tsx';
import {
  dismissImport,
  importItems,
  importLeftCount,
  restoreInboxItems,
} from '@/data/actions/inbox.ts';
import { count } from '@/lib/labels.ts';
import { runWrite } from '@/lib/run-write.ts';
import { useScreenReady } from '@/lib/screen-ready.ts';
import { useToday } from '@/lib/use-today.ts';

export const Route = createFileRoute('/_app/inbox/import/$importId')({
  staticData: { back: '/inbox' },
  component: ImportScreen,
});

/**
 * One import's items (wireframes/interop.md "Inbox"), oldest first by their original dates, with
 * the inbox's actions; its `⋯` dismisses what's left of it (M9-12).
 */
function ImportScreen() {
  const { importId } = Route.useParams();
  const day = useToday();
  const opened = useLiveQuery(() => importItems(importId, day), [importId, day]);
  useScreenReady('inbox-import', opened !== undefined);
  if (opened === undefined) return <ScreenSkeleton />;
  if (opened === null) {
    return (
      <>
        <ScreenTitle>Import not found</ScreenTitle>
        <NotFoundScreen>
          This import isn’t on this device. Its items may not have synced here yet.
        </NotFoundScreen>
      </>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <ScreenTitle>{importTitle(opened.importedAt)}</ScreenTitle>
      {opened.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <p className="text-lg font-medium">Nothing left from this import.</p>
          <p className="max-w-xs text-muted-foreground">Items you put in a lesson are there now.</p>
        </div>
      ) : (
        <>
          <ScreenActions>
            <ImportMenu importId={importId} importedAt={opened.importedAt} />
          </ScreenActions>
          <InboxList entries={opened.items.map((item) => ({ kind: 'item', item }))} />
        </>
      )}
    </div>
  );
}

/** `⋯` → "Dismiss all from this import…", which asks first, since it removes many. */
function ImportMenu({ importId, importedAt }: { importId: string; importedAt: string }) {
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);
  // Counted as the action counts, snoozed items included.
  const left = useLiveQuery(() => importLeftCount(importId), [importId]) ?? 0;

  async function dismissAll() {
    const ids = await dismissImport(importId);
    await navigate({ to: '/inbox', replace: true });
    toast(`Dismissed ${count(ids.length, 'item')}.`, {
      duration: 10_000,
      action: {
        label: 'Undo',
        onClick: () => runWrite(restoreInboxItems(ids), 'the import'),
      },
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label="Import actions" />}
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem variant="destructive" onClick={() => setAsking(true)}>
            Dismiss all from this import…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={`Dismiss ${count(left, 'item')} from the YouVersion import of ${importDay(importedAt)}?`}
        description="Items you’ve already put in a lesson stay there. Other items aren’t touched."
        confirmLabel={left === 1 ? 'Dismiss 1' : `Dismiss all ${left}`}
        onConfirm={() => runWrite(dismissAll(), 'the import')}
      />
    </>
  );
}
