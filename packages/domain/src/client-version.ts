/** One version of what sync carries, and the oldest web app that reads and writes it. */
export interface SyncFormat {
  /** The release that first carries this format: the oldest app the API serves once it ships. */
  minClientVersion: string;
  /** `syncFormatFingerprint()` of the schemas as they are in that release. */
  fingerprint: string;
  /** What changed, in a line. */
  change: string;
}

/**
 * Every change to the sync wire format, oldest first (TECH-DESIGN §6.7). A change to the entity,
 * body or sync schemas makes `sync-format.test.ts` fail until an entry is added here. An app
 * older than the entry's version would reject the new rows (it parses each pull page strictly),
 * so the entry normally takes the version of the release that ships the change. A change older
 * apps can still read and write keeps the previous minimum and says why.
 */
export const SYNC_FORMATS: readonly SyncFormat[] = [
  {
    minClientVersion: '0.0.0',
    fingerprint: 'bbca1ba1',
    change: 'Phase 1 (v1): the eleven entities, section bodies with verse chips, BSB and KJV',
  },
  {
    minClientVersion: '0.2.0',
    fingerprint: 'd7eba789',
    change:
      'M9 (interop): the inbox item; chips from outside (`shared`, `pasted`, a version label); the `pasteChips` and `openInTargets` settings',
  },
  {
    minClientVersion: '0.3.0',
    fingerprint: '6dce089d',
    change:
      'M10 (thinking layer): the `noteLink` body node; question entries, with `question.status` and `answerSectionId` out of the wire format; `question.splitFromId`; the template entity and the `defaultTemplates` setting; `lesson.source` renamed `kind`',
  },
  {
    minClientVersion: '0.4.0',
    fingerprint: '9bfde215',
    change:
      'M11 (sermon workflow): the lesson source columns; `section.sourceAt` and `sourcePage`; inbox item tags',
  },
  {
    minClientVersion: '0.5.0',
    fingerprint: '4a99c7ed',
    change:
      'M12 (reflection and export): passage visits and resurface dismissals; the `resurfacing` and `lastDigestQuarter` settings',
  },
];

/**
 * The oldest web app the sync API serves (§6.6): the newest format's minimum, so an older app
 * shows "Update required" instead of syncing rows it can't read or write. It follows from the
 * code, never from configuration.
 */
export const MIN_CLIENT_VERSION: string = SYNC_FORMATS.at(-1)?.minClientVersion ?? '0.0.0';

const numbers = (version: string): number[] =>
  (version.split(/[-+]/, 1)[0] ?? '').split('.').map((part) => Number.parseInt(part, 10) || 0);

/**
 * Orders two `major.minor.patch` versions: negative when `a` is older, 0 when equal. A
 * pre-release or build suffix (`-beta.1`, `+abc`) is ignored.
 */
export function compareVersions(a: string, b: string): number {
  const [x, y] = [numbers(a), numbers(b)];
  for (let i = 0; i < 3; i++) {
    const difference = (x[i] ?? 0) - (y[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Whether the sync API still serves a client of this version. */
export const isClientSupported = (version: string, min = MIN_CLIENT_VERSION): boolean =>
  compareVersions(version, min) >= 0;
