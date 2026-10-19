import { Button } from '@lamp/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@lamp/ui/components/dropdown-menu';
import { toast } from '@lamp/ui/components/sonner';
import { createFileRoute } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { EllipsisVertical } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog.tsx';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { LeaveGroupDialog } from '@/components/groups/leave-group-dialog.tsx';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { ScreenTitle } from '@/components/shell/slots.tsx';
import type { InGroup } from '@/data/db.ts';
import { groupView } from '@/data/groups.ts';
import { useAccount } from '@/lib/account.ts';
import { makeOwner, removeMember } from '@/lib/api.ts';
import { afterGroupChange, groupErrorMessage } from '@/lib/groups.ts';
import { useOnline } from '@/lib/use-online.ts';
import type { GroupMember } from '@lamp/domain';

export const Route = createFileRoute('/_app/groups/$groupId/members')({
  staticData: { title: 'Members', back: '..' },
  component: Members,
});

type Member = InGroup<GroupMember>;

/**
 * wireframes/sharing.md "Members": the owner first, each with their role; the owner's ⋮ makes a
 * member owner or removes them; anyone can leave.
 */
function Members() {
  const { groupId } = Route.useParams();
  const account = useAccount().data;
  const online = useOnline();
  const view = useLiveQuery(() => groupView(groupId), [groupId]);
  const [asking, setAsking] = useState<{ kind: 'owner' | 'remove'; member: Member } | null>(null);
  const [leaving, setLeaving] = useState(false);
  if (view === undefined) return <ScreenSkeleton />;
  if (view === null) return <NotFoundScreen>This group isn’t on this device.</NotFoundScreen>;
  const { group, members } = view;
  const owner = members.some((m) => m.userId === account?.id && m.role === 'owner');

  async function act(kind: 'owner' | 'remove', member: Member) {
    try {
      if (kind === 'owner') await makeOwner(groupId, member.userId);
      else await removeMember(groupId, member.userId);
    } catch (error) {
      toast.error(groupErrorMessage(error));
      return;
    }
    toast(
      kind === 'owner'
        ? `${member.displayName} is the owner now.`
        : `${member.displayName} was removed.`,
    );
    await afterGroupChange();
  }

  return (
    <div className="flex flex-col gap-6">
      <ScreenTitle>
        <span className="sr-only"> · {group.name}</span>
      </ScreenTitle>
      <ul className="flex flex-col divide-y">
        {members.map((member) => {
          const me = member.userId === account?.id;
          return (
            <li key={member.id} className="flex min-h-12 items-center gap-2 py-2">
              <span className="min-w-0 flex-1 break-words">
                {me ? 'You' : member.displayName}
                <span className="text-muted-foreground"> · {member.role}</span>
              </span>
              {owner && !me && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Actions for ${member.displayName}`}
                        disabled={!online}
                      />
                    }
                  >
                    <EllipsisVertical />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => setAsking({ kind: 'owner', member })}>
                      Make owner…
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setAsking({ kind: 'remove', member })}
                    >
                      Remove…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          );
        })}
      </ul>
      {!online && <p className="text-sm text-muted-foreground">Changes need a connection.</p>}
      <Button variant="outline" className="self-start" onClick={() => setLeaving(true)}>
        Leave group…
      </Button>
      {asking && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setAsking(null)}
          title={
            asking.kind === 'owner'
              ? `Make ${asking.member.displayName} the owner of ${group.name}?`
              : `Remove ${asking.member.displayName} from ${group.name}?`
          }
          description={
            asking.kind === 'owner'
              ? 'You’ll be a member.'
              : `${asking.member.displayName} loses access on their next sync. What they added to the group goes back to their own notes, and their comments are deleted.`
          }
          confirmLabel={
            asking.kind === 'owner' ? 'Make owner' : `Remove ${asking.member.displayName}`
          }
          variant={asking.kind === 'owner' ? 'default' : 'destructive'}
          onConfirm={() => act(asking.kind, asking.member)}
        />
      )}
      <LeaveGroupDialog
        open={leaving}
        onOpenChange={setLeaving}
        groupId={groupId}
        name={group.name}
        owner={owner}
        members={members.length}
      />
    </div>
  );
}
