import { activityLine } from '@lamp/domain';
import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageSection } from '@/components/page-section.tsx';
import { markGroupSeen } from '@/data/actions/group-activity.ts';
import { groupActivityOf } from '@/data/group-activity.ts';
import { agoLabel } from '@/lib/dates.ts';
import { threadLink } from '@/lib/groups.ts';
import { runWrite } from '@/lib/run-write.ts';

/** The rows shown: everything new, and at least this many in all. */
const SHOWN = 10;

/**
 * ACTIVITY on the group page (M13-11, wireframes/sharing.md "Notifications"): replies and comments
 * to the user's sections, and others' questions, latest first. Opening the group marks them seen;
 * what was new stays marked while the page is open, and what arrives while it's open is new too.
 */
export function GroupActivity({
  groupId,
  groupName,
  me,
}: {
  groupId: string;
  groupName: string;
  me: string;
}) {
  const activity = useLiveQuery(() => groupActivityOf(groupId, me), [groupId, me]);
  const [marked, setMarked] = useState<ReadonlySet<string>>(new Set());
  const fresh = activity?.items.filter((item) => item.isNew && !marked.has(item.id)) ?? [];
  if (fresh.length > 0) setMarked(new Set([...marked, ...fresh.map((item) => item.id)]));
  const unseen = activity?.fresh ?? 0;
  useEffect(() => {
    if (unseen > 0) runWrite(markGroupSeen(groupId, me), 'what you’ve seen');
  }, [groupId, me, unseen]);

  if (!activity) return null;
  const isNew = (id: string) => marked.has(id);
  const shown = activity.items.slice(0, Math.max(SHOWN, marked.size));
  return (
    <PageSection title={marked.size > 0 ? `Activity · ${marked.size} new` : 'Activity'}>
      {shown.length > 0 ? (
        <ul data-slot="row-list" className="flex flex-col divide-y">
          {shown.map((item) => (
            <li key={item.id}>
              <Link
                {...threadLink(groupId, item, me)}
                className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-3 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {isNew(item.id) && (
                  <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
                )}
                <span className="min-w-0 flex-1 break-words">
                  {isNew(item.id) && <span className="sr-only">New: </span>}
                  <span className={isNew(item.id) ? 'font-medium' : undefined}>
                    {activityLine(item, item.who)} in {item.lessonTitle}
                  </span>
                  <span className="text-muted-foreground"> · {agoLabel(item.at)}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nothing new. Replies and new questions in {groupName} show here.
        </p>
      )}
    </PageSection>
  );
}
