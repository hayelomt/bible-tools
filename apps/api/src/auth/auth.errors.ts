/** Error codes of the auth endpoints, beside the shared ones in `common/errors.ts`. */
export const AuthErrorCode = {
  /** A non-GET request without an `Origin` from this site. */
  BAD_ORIGIN: 'BAD_ORIGIN',
  SIGNUP_DISABLED: 'SIGNUP_DISABLED',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  PASSWORD_TOO_COMMON: 'PASSWORD_TOO_COMMON',
  /** Wrong email or password; which one is never said. */
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /** Too many failed logins for this email; `details.retryAfterSeconds` says how long. */
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  /** A verification or reset link that is unknown, used or expired; which one is never said. */
  TOKEN_INVALID: 'TOKEN_INVALID',
  ALREADY_VERIFIED: 'ALREADY_VERIFIED',
  /** A verification email went out under a minute ago; `details.retryAfterSeconds`. */
  RESEND_TOO_SOON: 'RESEND_TOO_SOON',
} as const;

export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];
