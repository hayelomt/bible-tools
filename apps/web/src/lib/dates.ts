/**
 * Calendar dates ("2026-10-12") as the UI shows them (UX-PATTERNS "Words"): "Sun 12 Oct" in lists,
 * "Sunday 12 October 2026" on the lesson. A lesson's date has no time or zone, so it's formatted
 * as a UTC midnight, which never shifts it to the day before or after.
 */

const SHORT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const SHORT_WITH_YEAR = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const LONG = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const asUtc = (date: string) => new Date(`${date}T00:00:00Z`);
const withoutCommas = (text: string) => text.replaceAll(',', '');
const pad = (n: number) => String(n).padStart(2, '0');

/** Today on this device, in its own time zone. */
export function today(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "Sun 12 Oct", with the year added when it isn't this year's. */
export function shortDate(date: string, now = new Date()): string {
  const format = date.startsWith(String(now.getFullYear())) ? SHORT : SHORT_WITH_YEAR;
  return withoutCommas(format.format(asUtc(date)));
}

/** "Sunday 12 October 2026". */
export function longDate(date: string): string {
  return withoutCommas(LONG.format(asUtc(date)));
}
