import { z } from 'zod';

/** Row ids: UUIDv7, generated on the device so offline creates need no round trip (§5.1). */
export const idSchema = z.uuidv7();

/** An instant on the wire: ISO 8601 in UTC ("2026-10-13T04:05:06.789Z"). */
export const timestampSchema = z.iso.datetime();

/** A calendar date without a time ("2026-10-04"), e.g. the day a lesson was preached. */
export const dateSchema = z.iso.date();

/**
 * A server revision (§6.3). Postgres stores it as bigint; the wire and the device use a plain
 * number, since a per-user counter never gets near 2^53. 0 = never synced.
 */
export const revSchema = z.int().min(0);

/** One-line text: trimmed, not empty. */
export const lineSchema = (max: number) => z.string().trim().min(1).max(max);

/** Longer free text, which may be empty. */
export const textSchema = (max: number) => z.string().max(max);
