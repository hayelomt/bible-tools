import type { MeResponse } from '@lamp/domain';
import { Switch } from '@lamp/ui/components/switch';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FormError } from '@/components/account/fields.tsx';
import { setAccount } from '@/lib/account.ts';
import { setGroupDigest } from '@/lib/api.ts';
import { groupErrorMessage } from '@/lib/groups.ts';
import { useOnline } from '@/lib/use-online.ts';

/**
 * Settings → Groups → Weekly email of group activity (M13-12, wireframes/sharing.md
 * "Notifications"): off until turned on. The server keeps it, so it changes online only, and needs
 * a verified address.
 */
export function DigestSetting({ account }: { account: MeResponse }) {
  const queryClient = useQueryClient();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const verified = account.emailVerifiedAt !== null;
  const note = !verified
    ? 'Verify your email to get it.'
    : !online
      ? 'Needs a connection to change.'
      : 'Sent on Mondays when there’s something new. Each email has a link to stop them.';
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center justify-between gap-4">
        <span className="flex flex-col gap-0.5">
          Weekly email of group activity
          <span className="text-sm text-muted-foreground">{note}</span>
        </span>
        <Switch
          checked={account.groupDigest}
          disabled={busy || !online || !verified}
          onCheckedChange={(on) => {
            setBusy(true);
            setError(undefined);
            void setGroupDigest(on)
              .then(() => setAccount(queryClient, { ...account, groupDigest: on }))
              .catch((e: unknown) => setError(groupErrorMessage(e)))
              .finally(() => setBusy(false));
          }}
        />
      </label>
      <FormError>{error}</FormError>
    </div>
  );
}
