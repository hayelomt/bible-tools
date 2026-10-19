import { Button } from '@lamp/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@lamp/ui/components/dialog';
import { Input } from '@lamp/ui/components/input';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Share2 } from 'lucide-react';
import { useState } from 'react';
import { FormError, OfflineNote } from '@/components/account/fields.tsx';
import { ConfirmDialog } from '@/components/confirm-dialog.tsx';
import { copyLink } from '@/components/share-links/share-link-dialog.tsx';
import { groupInvite } from '@/lib/api.ts';
import { groupErrorMessage } from '@/lib/groups.ts';
import { useOnline } from '@/lib/use-online.ts';

interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  name: string;
}

/**
 * wireframes/sharing.md "Invite": the owner's link to copy or share, and a new one that turns the
 * old one off. Read from the server each time it opens: it isn't kept on the device.
 */
export function InviteDialog({ open, onOpenChange, groupId, name }: InviteDialogProps) {
  const online = useOnline();
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const key = ['group-invite', groupId];
  const invite = useQuery({
    queryKey: key,
    queryFn: () => groupInvite(groupId),
    enabled: open && online,
    staleTime: 0,
  });
  const renew = useMutation({
    mutationFn: () => groupInvite(groupId, true),
    onSuccess: (url) => queryClient.setQueryData(key, url),
  });
  const url = invite.data;
  const canShare = typeof navigator.share === 'function';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite people</DialogTitle>
            <DialogDescription>Anyone with this link can join {name}.</DialogDescription>
          </DialogHeader>
          {!online ? (
            <OfflineNote />
          ) : url ? (
            <div className="flex flex-col gap-4">
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={url}
                  aria-label="Invite link"
                  onFocus={(e) => e.target.select()}
                />
                <Button variant="outline" onClick={() => void copyLink(url)}>
                  <Copy aria-hidden />
                  Copy
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                {canShare ? (
                  <Button
                    variant="outline"
                    onClick={() =>
                      void navigator.share({ title: `Join ${name}`, url }).catch(() => {})
                    }
                  >
                    <Share2 aria-hidden />
                    Share…
                  </Button>
                ) : (
                  <span />
                )}
                <Button variant="ghost" disabled={renew.isPending} onClick={() => setAsking(true)}>
                  Make a new link…
                </Button>
              </div>
            </div>
          ) : invite.error ? (
            <FormError>{groupErrorMessage(invite.error)}</FormError>
          ) : (
            <p className="text-sm text-muted-foreground">Getting the link…</p>
          )}
          <FormError>{renew.error && groupErrorMessage(renew.error)}</FormError>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title="Make a new invite link?"
        description="The old link stops working. Anyone who hasn't joined yet needs the new one."
        confirmLabel="Make a new link"
        onConfirm={() =>
          renew.mutateAsync().then(
            () => undefined,
            () => undefined,
          )
        }
      />
    </>
  );
}
