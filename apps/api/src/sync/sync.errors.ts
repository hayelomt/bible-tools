/** Error codes of the sync endpoints and of rejected changes, beside those in `common/errors.ts`. */
export const SyncErrorCode = {
  /** The whole push: the account's email isn't verified yet (§7.2). */
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  /** The change doesn't match `changeSchema`; the message names the fields. */
  INVALID_CHANGE: 'INVALID_CHANGE',
  /** The change id was already used by another account. */
  CHANGE_ID_TAKEN: 'CHANGE_ID_TAKEN',
  /** The row's id belongs to another account. */
  ID_TAKEN: 'ID_TAKEN',
  /** A delete of a row the server has never seen. */
  NOT_FOUND: 'NOT_FOUND',
  /** The row names a lesson, section, tag or series that this account doesn't have. */
  REFERENCE_NOT_FOUND: 'REFERENCE_NOT_FOUND',
  /** Another live row already has the same unique value, such as a tag name. */
  DUPLICATE: 'DUPLICATE',
  /**
   * The change would take a series or lesson out of the group it's shared with (§17.12), which
   * only the group's endpoints do.
   */
  IN_GROUP: 'IN_GROUP',
  /** The row breaks a rule only the database checks. */
  CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION',
} as const;

export type SyncErrorCode = (typeof SyncErrorCode)[keyof typeof SyncErrorCode];
