/**
 * The oldest web app the sync API serves (TECH-DESIGN §6.6). Raise it in the release that changes
 * what push or pull carry, so an older app shows "Update required" instead of syncing rows it
 * can't read or write. A constant, not configuration: it follows from the code.
 */
export const MIN_CLIENT_VERSION = '0.0.0';

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
