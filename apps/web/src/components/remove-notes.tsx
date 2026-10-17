import { Button } from '@lamp/ui/components/button';
import { toast } from '@lamp/ui/components/sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { writesSettled } from '@/data/action.ts';
import { db } from '@/data/db.ts';
import { useAccount } from '@/lib/account.ts';
import { count, type NoteCounts, notesSummary, notesTotal } from '@/lib/labels.ts';
import { forgetSearches } from '@/lib/recent-searches.ts';
import { noteCounts, removeNotes, unsyncedCount } from '@/sync/device-data.ts';
import { syncEngine } from '@/sync/sync.ts';
import { ConfirmDialog } from './confirm-dialog.tsx';

/**
 * Settings → Storage → "Remove notes from this device" (wireframes/account.md, §6.6): for a shared
 * computer, so only while signed out. The device starts again as a new guest; the settings stay.
 */
export function RemoveNotes() {
  const signedIn = !!useAccount().data;
  const [asking, setAsking] = useState(false);
  const info = useLiveQuery(
    async () => ({ counts: await noteCounts(db), unsynced: await unsyncedCount(db) }),
    [],
  );
  if (signedIn || !info) return null;

  return (
    <>
      <Button variant="outline" className="self-start" onClick={() => setAsking(true)}>
        Remove notes from this device…
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title="Remove all notes from this device?"
        description={`${removedLine(info.counts)} Notes already synced to an account stay in that account.`}
        warning={
          info.unsynced > 0
            ? `${count(info.unsynced, 'change')} never synced and will be lost.`
            : null
        }
        confirmLabel="Remove notes"
        onConfirm={remove}
      />
    </>
  );
}

async function remove() {
  await writesSettled();
  await syncEngine.settled();
  await removeNotes(db, null);
  forgetSearches();
  // The engine sees a guest again.
  void syncEngine.syncNow();
  toast('Notes removed from this device.');
}

/** "12 lessons and 3 highlights are deleted from this device." */
function removedLine(counts: NoteCounts) {
  const total = notesTotal(counts);
  if (total === 0) return 'Everything on this device is deleted.';
  return `${notesSummary(counts)} ${total === 1 ? 'is' : 'are'} deleted from this device.`;
}
