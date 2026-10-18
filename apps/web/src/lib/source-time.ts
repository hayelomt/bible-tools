/**
 * Times in a lesson's source (F28, TECH-DESIGN §17.7): a section's `sourceAt` is a moment, and
 * what shows is how far it is into the recording, `sourceAt − sourceStartedAt`, so setting the
 * start afterwards corrects every time.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** A length of time as a clock shows it: "09:45", "1:02:10"; "−00:30" before the start. */
export function clockLabel(ms: number): string {
  const sign = ms < 0 ? '−' : '';
  const seconds = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${sign}${h}:${pad(m)}:${pad(s)}` : `${sign}${pad(m)}:${pad(s)}`;
}

/** How far a moment is into the source: "23:14". */
export function offsetLabel(at: string, startedAt: string): string {
  return clockLabel(Date.parse(at) - Date.parse(startedAt));
}

/** The time of day of a moment on this device, for a time field: "10:30", or "10:30:15". */
export function timeOfDay(iso: string, seconds = false): string {
  const at = new Date(iso);
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  return seconds ? `${time}:${pad(at.getSeconds())}` : time;
}

/**
 * The moment on the same day as `day` (on this device) at a typed time of day ("10:30"), for
 * "Set the start"; null for a time that isn't one.
 */
export function atTimeOfDay(day: string, time: string): string | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!match) return null;
  const [h, m, s = '0'] = match.slice(1).map((part) => part ?? '0') as [string, string, string];
  if (Number(h) > 23 || Number(m) > 59 || Number(s) > 59) return null;
  const at = new Date(day);
  at.setHours(Number(h), Number(m), Number(s), 0);
  return at.toISOString();
}

/** A section's place in its source, as typed in "Time or page…" (M11-07). */
export type SourceMoment = { kind: 'time'; ms: number } | { kind: 'page'; page: string };

/**
 * "9:45" or "1:02:10" is a time into the recording; "p. 112", "page 112", "pp. 112–14" or a bare
 * "112" is a page. Null for anything else.
 */
export function parseMoment(text: string): SourceMoment | null {
  const typed = text.trim();
  const time = /^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/.exec(typed);
  if (time) {
    const [h = '0', m = '0', s = '0'] = time.slice(1).map((part) => part ?? '0');
    if (Number(s) > 59 || (time[1] !== undefined && Number(m) > 59)) return null;
    return { kind: 'time', ms: ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000 };
  }
  const page = /^(?:pp?\.?|pages?)?\s*(\d[\w–-]*)$/i.exec(typed);
  if (page?.[1] && page[1].length <= 20) return { kind: 'page', page: page[1].replace('-', '–') };
  return null;
}

/** "p. 112", as a section shows its page. */
export const pageLabel = (page: string) => `p. ${page}`;

/** Seconds into the source, for a link to that moment; 0 before the start. */
export function offsetSeconds(at: string, startedAt: string): number {
  return Math.max(0, Math.floor((Date.parse(at) - Date.parse(startedAt)) / 1000));
}

/**
 * Where a lesson's times count from when it has no start yet: midnight on its date, on this
 * device, so a typed "9:45" is 9 minutes 45 seconds into the recording (decided 2026-10-19).
 */
export const midnightOf = (date: string) => new Date(`${date}T00:00`).toISOString();
