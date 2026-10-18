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

/** The time of day of a moment on this device, for a time field: "10:30". */
export function timeOfDay(iso: string): string {
  const at = new Date(iso);
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
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
