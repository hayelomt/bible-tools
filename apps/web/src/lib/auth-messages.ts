import { ApiRequestError, NetworkError } from './api.ts';

/** The part of a domain (Zod) request schema a form needs. */
interface RequestSchema {
  safeParse(
    value: unknown,
  ): { success: true } | { success: false; error: { issues: { path: PropertyKey[] }[] } };
}

export const OFFLINE_NOTE = 'Needs a connection. Your notes keep working offline.';

function minutes(seconds: number | undefined): string {
  const n = Math.max(1, Math.ceil((seconds ?? 15 * 60) / 60));
  return n === 1 ? '1 minute' : `${n} minutes`;
}

/** What an auth screen says when a request fails (wireframes/account.md). */
export function authErrorMessage(error: unknown): string {
  if (error instanceof NetworkError) {
    return "Couldn't reach the server. Your notes keep working offline.";
  }
  if (!(error instanceof ApiRequestError)) return 'Something went wrong. Try again.';
  switch (error.errorCode) {
    case 'INVALID_CREDENTIALS':
      return 'The email or password is wrong.';
    case 'ACCOUNT_LOCKED':
      return `Too many tries. Wait ${minutes(error.retryAfterSeconds)}, or reset your password.`;
    case 'ACCOUNT_DISABLED':
      return 'This account is turned off. Ask whoever runs this Lamp server.';
    case 'EMAIL_TAKEN':
      return "There's already an account for this email.";
    case 'PASSWORD_TOO_COMMON':
      return 'That password is too common. Choose another.';
    case 'SIGNUP_DISABLED':
      return "This Lamp server doesn't take new accounts.";
    case 'WRONG_PASSWORD':
      return "That isn't your current password.";
    case 'TOKEN_INVALID':
      return 'This link has expired or was already used.';
    case 'ALREADY_VERIFIED':
      return 'Your email is already verified.';
    case 'RESEND_TOO_SOON':
      return 'The email was sent less than a minute ago. Wait a moment, then send it again.';
    case 'TOO_MANY_REQUESTS':
      return 'Too many tries. Wait a few minutes and try again.';
    case 'UNAUTHORIZED':
      return "You're signed out. Sign in again.";
    default:
      return 'Something went wrong. Try again.';
  }
}

/**
 * Checks a form with its request schema before sending, and gives each field with a problem the
 * message for that field. Fields without a message (a token from the address) are not reported.
 */
export function fieldErrors<K extends string>(
  schema: RequestSchema,
  values: Record<K, string>,
  messages: Partial<Record<K, string>>,
): Partial<Record<K, string>> {
  const result = schema.safeParse(values);
  if (result.success) return {};
  const errors: Partial<Record<K, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as K;
    if (messages[field]) errors[field] = messages[field];
  }
  return errors;
}
