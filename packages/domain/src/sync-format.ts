import { z } from 'zod';
import { pullResponseSchema, pushRequestSchema } from './schemas/sync.ts';

/**
 * A fingerprint of what sync carries (TECH-DESIGN §6.7): the JSON Schema of a pull page, as the
 * device parses it, and of a push, as the server accepts it. Every entity, column, enum value,
 * body node and translation id is in it, so a change to any of them changes the fingerprint.
 * Refinements (a passage in the book table, a repeated mark) aren't; a stricter one is a format
 * change all the same.
 *
 * `sync-format.test.ts` compares it with the newest entry of `SYNC_FORMATS`, so the wire format
 * can't change without a decision on `MIN_CLIENT_VERSION`.
 */
export const syncFormatFingerprint = (): string =>
  fingerprintOf(pullResponseSchema, pushRequestSchema);

/** The fingerprint of a pull page schema and a push schema; exported for its tests. */
export function fingerprintOf(pull: z.ZodType, push: z.ZodType): string {
  const options = { unrepresentable: 'any', cycles: 'ref' } as const;
  const formats = {
    pull: z.toJSONSchema(pull, { ...options, io: 'output' }),
    push: z.toJSONSchema(push, { ...options, io: 'input' }),
  };
  return fnv1a(stableJson(formats));
}

/** JSON Schema lists whose order means nothing. */
const UNORDERED = new Set(['required', 'enum']);

/**
 * JSON with every object's keys sorted, and the `required` and `enum` lists too, so declaring a
 * field or a value in another place changes nothing.
 */
function stableJson(value: unknown, unordered = false): string {
  if (Array.isArray(value)) {
    const items = value.map((item) => stableJson(item));
    return `[${(unordered ? items.toSorted() : items).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const fields = entries.map(
      ([key, inner]) => `${JSON.stringify(key)}:${stableJson(inner, UNORDERED.has(key))}`,
    );
    return `{${fields.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** 32-bit FNV-1a as 8 hex digits: a change detector, not a security measure. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
