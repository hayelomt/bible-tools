import { Button } from '@lamp/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@lamp/ui/components/dialog';
import { toast } from '@lamp/ui/components/sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { setAccount } from '@/lib/account.ts';
import { ApiRequestError, deleteAccount } from '@/lib/api.ts';
import { authErrorMessage } from '@/lib/auth-messages.ts';
import { useOnline } from '@/lib/use-online.ts';
import { Field, FormError, OfflineNote, PasswordField } from './fields.tsx';

const CONFIRM_WORD = 'DELETE';

/**
 * wireframes/account.md "Delete account" (M3-03's screen, built with the privacy note, M13-05): the
 * one action confirmed by typing, with the password asked again (decision 30). The device keeps its
 * notes, as at sign-out, until they're removed in Settings → Storage.
 */
export function DeleteAccount({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="link"
        className="self-start px-0 text-destructive"
        onClick={() => setOpen(true)}
      >
        Delete account…
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open && <DeleteDialog email={email} />}
      </Dialog>
    </>
  );
}

function DeleteDialog({ email }: { email: string }) {
  const queryClient = useQueryClient();
  const online = useOnline();
  const cancel = useRef<HTMLButtonElement>(null);
  const [password, setPassword] = useState('');
  const [word, setWord] = useState('');
  const remove = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      setAccount(queryClient, null);
      toast('Account deleted. Notes on this device stay until you remove them.');
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 401) setAccount(queryClient, null);
    },
  });
  const wrong =
    remove.error instanceof ApiRequestError && remove.error.errorCode === 'WRONG_PASSWORD';
  const message = remove.error ? authErrorMessage(remove.error) : undefined;
  const ready = password !== '' && word.trim() === CONFIRM_WORD;

  return (
    <DialogContent showCloseButton={false} initialFocus={cancel}>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (ready && online) remove.mutate({ password });
        }}
      >
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            Every lesson, note, highlight and memory verse in the account is deleted from the
            server, and every device is signed out. This can’t be undone. Notes already on a device
            stay there until you remove them.
          </DialogDescription>
        </DialogHeader>
        <input type="email" autoComplete="username" value={email} readOnly hidden />
        <PasswordField
          label="Password"
          autoComplete="current-password"
          value={password}
          error={wrong ? message : undefined}
          onChange={(event) => {
            setPassword(event.target.value);
            remove.reset();
          }}
        />
        <Field
          label={`Type ${CONFIRM_WORD} to confirm`}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          value={word}
          onChange={(event) => setWord(event.target.value)}
        />
        {!wrong && <FormError>{message}</FormError>}
        {!online && <OfflineNote />}
        <DialogFooter>
          <DialogClose ref={cancel} render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            type="submit"
            variant="destructive"
            disabled={!ready || !online || remove.isPending}
          >
            {remove.isPending ? 'Deleting account…' : 'Delete account'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
