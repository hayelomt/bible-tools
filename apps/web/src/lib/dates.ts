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

/** "Sun 12 Oct 2026", always with the year: for a printed page, which outlives the year. */
export function shortDateWithYear(date: string): string {
  return withoutCommas(SHORT_WITH_YEAR.format(asUtc(date)));
}

/** "Sunday 12 October 2026". */
export function longDate(date: string): string {
  return withoutCommas(LONG.format(asUtc(date)));
}

const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

/**
 * A moment in this device's time zone: "today 09:41", "yesterday 09:41" or "Sun 12 Oct 09:41".
 * `joiner` goes between the day and the time ("today at 09:41").
 */
export function momentLabel(iso: string, now = new Date(), joiner = ' '): string {
  const at = new Date(iso);
  const day = today(at);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const dayLabel =
    day === today(now) ? 'today' : day === today(yesterday) ? 'yesterday' : shortDate(day, now);
  return `${dayLabel}${joiner}${TIME.format(at)}`;
}

/** How long ago: "just now", "2 min ago", "3 h ago", then the moment ("yesterday 09:41"). */
export function agoLabel(iso: string, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 12 * 60) return `${Math.floor(minutes / 60)} h ago`;
  return momentLabel(iso, now);
}

/** When something arrived, as a list shows it: "10:42" today, "Thu 16 Oct" before. */
export function receivedLabel(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const day = today(at);
  return day === today(now) ? TIME.format(at) : shortDate(day, now);
}
