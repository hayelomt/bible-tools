import { v7 } from 'uuid';

/**
 * A new row id: UUIDv7, so ids sort by creation time and offline creates need no server round
 * trip (TECH-DESIGN §5.1). Used for rows, sync changes and the device id.
 */
export function newId(): string {
  return v7();
}

/**
 * The id of a user's own lesson for a group lesson (decision 99, §17.12): a UUIDv7 with the group
 * lesson's time bits, the rest from the SHA-256 of the pair, so every device of the user makes the
 * same row, even offline.
 */
export function ownLessonId(userId: string, groupLessonId: string): Promise<string> {
  return derivedId(`own-lesson:${userId}:${groupLessonId}`, groupLessonId);
}

/** The id of a user's visit to a group (M13-11, §17.12), made the same way from the pair. */
export function groupVisitId(userId: string, groupId: string): Promise<string> {
  return derivedId(`group-visit:${userId}:${groupId}`, groupId);
}

/** A UUIDv7 with the time bits of `timeOf` (an id), the rest from the SHA-256 of `key`. */
async function derivedId(key: string, timeOf: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', data));
  const hex = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const time = timeOf.replaceAll('-', '').slice(0, 12);
  const variant = ((Number.parseInt(hex[15]!, 16) & 0x3) | 0x8).toString(16);
  const rest = `${time}7${hex.slice(0, 3)}${variant}${hex.slice(3, 18)}`;
  return `${rest.slice(0, 8)}-${rest.slice(8, 12)}-${rest.slice(12, 16)}-${rest.slice(16, 20)}-${rest.slice(20, 32)}`;
}
