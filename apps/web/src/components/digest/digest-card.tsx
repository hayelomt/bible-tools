import { type Quarter, quarterLabel } from '@lamp/domain';
import { Button, buttonVariants } from '@lamp/ui/components/button';
import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { draftDigest } from '@/data/actions/digest.ts';
import { db, SYNC_STATE_KEY } from '@/data/db.ts';
import { today } from '@/lib/dates.ts';
import { runWrite } from '@/lib/run-write.ts';
import { useSyncStatus } from '@/sync/sync.ts';

/** Drafted at most once each time the app opens; "Not now" lasts until the next open. */
let checked = false;
const notNow = new Set<Quarter>();

/**
 * Drafts the last quarter's digest on the first open after it ends (F32, M12-08), once per
 * account: on a device that's signed in, only once this open's sync has gone through, so it knows
 * whether another device drafted it already; at once on one that never signed in.
 */
function useDraftDigest() {
  const { phase } = useSyncStatus();
  useEffect(() => {
    if (checked) return;
    void (async () => {
      const state = await db.syncState.get(SYNC_STATE_KEY);
      if (checked || (state?.ownerUserId && phase !== 'synced')) return;
      checked = true;
      // Nothing when another device's draft, pulled since, set `lastDigestQuarter` already.
      runWrite(draftDigest(today()), 'the digest draft');
    })();
  }, [phase]);
}

/**
 * The card on the Lessons home (wireframes/reflection.md "Quarterly digest"): "Your July–September
 * digest is ready to look over." with Open draft and Not now. Shown while the draft is there.
 */
export function DigestCard() {
  useDraftDigest();
  const [, setHidden] = useState(0);
  const drafts = useLiveQuery(
    async () =>
      (await db.digestDraft.toArray()).toSorted((a, b) => b.quarter.localeCompare(a.quarter)),
    [],
  );
  const shown = (drafts ?? []).filter((d) => !notNow.has(d.quarter));
  if (shown.length === 0) return null;
  return shown.map((draft) => (
    <section
      key={draft.quarter}
      aria-label="Digest"
      className="-mt-4 flex flex-col gap-3 rounded-xl border p-4"
    >
      <p>Your {quarterLabel(draft.quarter).replace(/ \d{4}$/, '')} digest is ready to look over.</p>
      <div className="flex items-center justify-between gap-2">
        <Link
          to="/digest/$quarter"
          params={{ quarter: draft.quarter }}
          data-slot="button"
          className={buttonVariants({ className: 'pointer-coarse:min-h-11' })}
        >
          Open draft
          <ChevronRight aria-hidden />
        </Link>
        <Button
          variant="ghost"
          className="pointer-coarse:min-h-11"
          onClick={() => {
            notNow.add(draft.quarter);
            setHidden((n) => n + 1);
          }}
        >
          Not now
        </Button>
      </div>
    </section>
  ));
}
