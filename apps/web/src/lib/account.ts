import { type MeResponse, meResponseSchema } from '@lamp/domain';
import { type QueryClient, useQuery } from '@tanstack/react-query';
import { fetchMe } from './api.ts';

/** The last account the server named, so an offline start still knows who is signed in. */
const MIRROR_KEY = 'lamp.account';
const ACCOUNT_KEY = ['account'] as const;

function readMirror(): MeResponse | null {
  try {
    const parsed = meResponseSchema.safeParse(JSON.parse(localStorage.getItem(MIRROR_KEY) ?? ''));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function writeMirror(me: MeResponse | null) {
  if (me) localStorage.setItem(MIRROR_KEY, JSON.stringify(me));
  else localStorage.removeItem(MIRROR_KEY);
}

/**
 * The signed-in account, or null for a guest. Starts from the mirror and asks the server at once;
 * offline, the mirror stands until the device is back online.
 */
export function useAccount() {
  return useQuery({
    queryKey: ACCOUNT_KEY,
    queryFn: async () => {
      const me = await fetchMe();
      writeMirror(me);
      return me;
    },
    initialData: readMirror,
    initialDataUpdatedAt: 0,
    retry: false,
  });
}

/** After a sign-in, sign-up or sign-out, without waiting for the next `me`. */
export function setAccount(queryClient: QueryClient, me: MeResponse | null) {
  writeMirror(me);
  queryClient.setQueryData(ACCOUNT_KEY, me);
}

/** The server sends one verification email a minute (§7.3); kept for this page load only. */
const RESEND_WAIT_MS = 60_000;
let verificationSentAt = 0;

/** A verification email just went out; `waitSeconds` when the server says how long to wait. */
export function noteVerificationSent(waitSeconds = RESEND_WAIT_MS / 1000) {
  verificationSentAt = Date.now() - RESEND_WAIT_MS + waitSeconds * 1000;
}

/** Seconds until "Send it again" can be used. */
export function resendWait(now = Date.now()): number {
  return Math.max(0, Math.ceil((verificationSentAt + RESEND_WAIT_MS - now) / 1000));
}

/** Asks the server again, e.g. once the email is verified. */
export function refreshAccount(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ACCOUNT_KEY });
}
