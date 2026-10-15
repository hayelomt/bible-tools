type Reporter = (error: unknown) => void;

/** Errors before Sentry has loaded, kept so they're sent once it has. */
const MAX_WAITING = 10;

let reporter: Reporter | undefined;
const waiting: unknown[] = [];

/**
 * Sends an error the app caught itself (a screen's error boundary) to Sentry, once it's loaded
 * and only when it's on (`src/lib/sentry.ts`). Without Sentry it does nothing. No Sentry code is
 * loaded here, so the first screen doesn't wait for it.
 */
export function reportError(error: unknown): void {
  if (reporter) reporter(error);
  else if (waiting.length < MAX_WAITING) waiting.push(error);
}

/** Called once Sentry has started: sends what was waiting, and everything after. */
export function setErrorReporter(next: Reporter): void {
  reporter = next;
  for (const error of waiting.splice(0)) next(error);
}
