import { toast } from '@lamp/ui/components/sonner';
import { useNavigate } from '@tanstack/react-router';
import { ConfirmDialog } from '@/components/confirm-dialog.tsx';
import { db } from '@/data/db.ts';
import { leaveGroup } from '@/lib/api.ts';
import { afterGroupChange, groupErrorMessage } from '@/lib/groups.ts';
import { useOnline } from '@/lib/use-online.ts';
import { dropGroup } from '@/sync/groups.ts';

interface LeaveGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  name: string;
  owner: boolean;
  members: number;
}

/**
 * wireframes/sharing.md "Members" → Leave: what the user added goes back to their own notes and
 * their comments go (decision 98). The owner hands the group over first, unless they're the last
 * member, which deletes the group.
 */
export function LeaveGroupDialog({
  open,
  onOpenChange,
  groupId,
  name,
  owner,
  members,
}: LeaveGroupDialogProps) {
  const navigate = useNavigate();
  const online = useOnline();
  const last = members <= 1;
  const blocked = owner && !last;
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Leave ${name}?`}
      description={
        blocked
          ? 'You’re the owner. Make another member the owner first, under Members.'
          : last
            ? 'You’re its last member, so the group is deleted. Your own notes stay yours.'
            : 'What you added to it goes back to your own notes, and your comments are deleted.'
      }
      warning={!blocked && !online ? 'Leaving needs a connection.' : null}
      confirmLabel={blocked || !online ? 'OK' : last ? 'Leave and delete' : 'Leave group'}
      variant={blocked || !online ? 'default' : 'destructive'}
      onConfirm={async () => {
        if (blocked || !online) return;
        try {
          await leaveGroup(groupId);
        } catch (failure) {
          toast.error(`Couldn’t leave ${name}. ${groupErrorMessage(failure)}`);
          return;
        }
        await dropGroup(db, groupId);
        toast(last ? `${name} was deleted.` : `You left ${name}.`);
        await navigate({ to: '/', replace: true });
        void afterGroupChange();
      }}
    />
  );
}
