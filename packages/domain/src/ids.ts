import { v7 } from 'uuid';

/**
 * A new row id: UUIDv7, so ids sort by creation time and offline creates need no server round
 * trip (TECH-DESIGN §5.1). Used for rows, sync changes and the device id.
 */
export function newId(): string {
  return v7();
}
