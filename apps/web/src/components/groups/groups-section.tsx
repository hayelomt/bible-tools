import { Button } from '@lamp/ui/components/button';
import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { PageSection } from '@/components/page-section.tsx';
import { allGroups } from '@/data/groups.ts';
import { useAccount } from '@/lib/account.ts';
import { count } from '@/lib/labels.ts';
import { CreateGroupDialog } from './create-group-dialog.tsx';

/**
 * GROUPS on the Lessons home (wireframes/sharing.md "Groups"): each group with its members, and
 * `+ New`. Only for an account, since a group lives on the server; a guest sees none.
 */
export function GroupsSection() {
  const account = useAccount().data;
  const groups = useLiveQuery(() => allGroups(), []);
  const [creating, setCreating] = useState(false);
  if (!account && !groups?.length) return null;
  return (
    <PageSection
      title="Groups"
      action={
        <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
          <Plus aria-hidden />
          New<span className="sr-only"> group</span>
        </Button>
      }
    >
      {groups && groups.length > 0 ? (
        <ul data-slot="row-list" className="flex flex-col divide-y">
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                to="/groups/$groupId"
                params={{ groupId: group.id }}
                className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-3 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span data-slot="row-title" className="min-w-0 flex-1 break-words">
                  {group.name}
                  <span className="text-muted-foreground"> · {count(group.members, 'member')}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Study a series with others: they see its lessons and what’s added to the group’s thread.
        </p>
      )}
      <CreateGroupDialog open={creating} onOpenChange={setCreating} />
    </PageSection>
  );
}
