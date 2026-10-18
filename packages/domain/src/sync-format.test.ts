import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { compareVersions, MIN_CLIENT_VERSION, SYNC_FORMATS } from './client-version.ts';
import { pullResponseSchema, pushRequestSchema } from './schemas/sync.ts';
import { fingerprintOf, syncFormatFingerprint } from './sync-format.ts';

const newest = SYNC_FORMATS.at(-1)!;

describe('the sync format', () => {
  it('matches the newest entry of SYNC_FORMATS', () => {
    // A failure here means push or pull now carry something an older app can't read or write.
    // Add an entry to SYNC_FORMATS with this fingerprint and, normally, the version of the release
    // that ships the change as its minimum (TECH-DESIGN §6.7).
    expect(syncFormatFingerprint(), 'the sync format changed: see TECH-DESIGN §6.7').toBe(
      newest.fingerprint,
    );
  });

  it('keeps its entries in order, each format once', () => {
    for (let i = 1; i < SYNC_FORMATS.length; i++) {
      expect(
        compareVersions(SYNC_FORMATS[i]!.minClientVersion, SYNC_FORMATS[i - 1]!.minClientVersion),
      ).toBeGreaterThanOrEqual(0);
    }
    const fingerprints = SYNC_FORMATS.map((format) => format.fingerprint);
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
    expect(MIN_CLIENT_VERSION).toBe(newest.minClientVersion);
  });
});

/** A body schema that allows these node types. */
const bodyOf = (nodes: string[]) =>
  z.strictObject({ type: z.literal('doc'), content: z.array(z.enum(nodes)) });

describe('fingerprintOf', () => {
  const current = fingerprintOf(pullResponseSchema, pushRequestSchema);

  it('changes with a field, an enum value or a body node', () => {
    const extraField = pullResponseSchema.extend({ extra: z.string() });
    expect(fingerprintOf(extraField, pushRequestSchema)).not.toBe(current);
    const looser = pushRequestSchema.extend({ clientVersion: z.string() });
    expect(fingerprintOf(pullResponseSchema, looser)).not.toBe(current);

    expect(fingerprintOf(bodyOf(['paragraph']), pushRequestSchema)).not.toBe(
      fingerprintOf(bodyOf(['paragraph', 'noteLink']), pushRequestSchema),
    );
  });

  it("doesn't change when fields are declared in another order", () => {
    const ab = z.strictObject({ a: z.string(), b: z.int() });
    const ba = z.strictObject({ b: z.int(), a: z.string() });
    expect(fingerprintOf(ab, ab)).toBe(fingerprintOf(ba, ba));
  });
});

/** A pull page holding one section with this body. */
const page = (body: object) => ({
  rows: [
    {
      entity: 'section',
      row: {
        id: '0199e0a0-0000-7000-8000-000000000002',
        lessonId: '0199e0a0-0000-7000-8000-000000000003',
        parentId: null,
        orderKey: 'a0',
        body,
        conflictOf: null,
        conflictDevice: null,
        sourceAt: null,
        sourcePage: null,
        createdAt: '2026-10-17T09:00:00.000Z',
        updatedAt: '2026-10-17T09:00:00.000Z',
        deletedAt: null,
        rev: 1,
      },
    },
  ],
  nextCursor: 1,
  hasMore: false,
  remaining: 1,
  serverTime: '2026-10-17T09:00:00.000Z',
  minClientVersion: MIN_CLIENT_VERSION,
});

const paragraph = (inline: object) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [inline] }],
});

describe('why the minimum matters', () => {
  it('an app on this format rejects a whole pull page that holds a node it does not know', () => {
    expect(
      pullResponseSchema.safeParse(page(paragraph({ type: 'text', text: 'Hi' }))).success,
    ).toBe(true);
    // F23's link to another lesson: this format knows it, and a v1 or M9 app has never heard of
    // it, as this app hasn't heard of a node a later format may add.
    const link = {
      type: 'noteLink',
      attrs: {
        targetType: 'lesson',
        targetId: '0199e0a0-0000-7000-8000-000000000004',
        label: 'The Good Shepherd',
      },
    };
    expect(pullResponseSchema.safeParse(page(paragraph(link))).success).toBe(true);
    const later = { type: 'footnote', attrs: { text: 'See the appendix' } };
    expect(pullResponseSchema.safeParse(page(paragraph(later))).success).toBe(false);
  });
});
