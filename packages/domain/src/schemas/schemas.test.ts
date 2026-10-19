import { describe, expect, expectTypeOf, it } from 'vitest';
import { emptyBody } from '../doc.ts';
import { keyBetween } from '../order.ts';
import { SEED_TAGS } from '../seed-tags.ts';
import type { VerseRef } from '../verse-ref.ts';
import { verseRefSchema } from './verse-ref.ts';
import { apiErrorSchema, devicesResponseSchema, healthResponseSchema } from './api.ts';
import {
  changePasswordRequestSchema,
  deleteAccountRequestSchema,
  loginRequestSchema,
  meResponseSchema,
  resetPasswordRequestSchema,
  signupRequestSchema,
  verifyEmailRequestSchema,
} from './auth.ts';
import {
  citationSchema,
  ENTITY_NAMES,
  ENTITY_SCHEMAS,
  type EntityName,
  tagSchema,
} from './entities.ts';
import {
  type Change,
  changeSchema,
  type PulledRow,
  pullQuerySchema,
  pullResponseSchema,
  pushRequestSchema,
  pushResponseSchema,
} from './sync.ts';

const id = (n: number) => `0199c3a0-0000-7000-8000-${String(n).padStart(12, '0')}`;
const NOW = '2026-10-13T04:05:06.789Z';
const meta = (n: number) => ({
  id: id(n),
  createdAt: NOW,
  updatedAt: NOW,
  rev: 3,
  deletedAt: null,
});
const ROM_8_28: VerseRef = {
  book: 'ROM',
  chapter: 8,
  verseStart: 28,
  display: 'Romans 8:28',
  translation: 'BSB',
};

/** One valid row per synced entity. */
const ROWS: { [E in EntityName]: unknown } = {
  userSettings: {
    colorMode: 'system',
    defaultTranslation: 'BSB',
    reviewWindowDays: 14,
    autoPreviewVerses: false,
    pasteChips: true,
    openInTargets: ['blueletterbible', 'youversion', 'biblehub', 'logos'],
    defaultTemplates: { sermon: null, personal: 'builtin:soap', group: id(13) },
    resurfacing: { yearAgo: true, repeatedVerse: false, staleQuestion: true },
    lastDigestQuarter: '2026-Q3',
    rev: 1,
    updatedAt: NOW,
  },
  series: { ...meta(1), title: 'Romans', description: '', kind: 'sermon_series' },
  lesson: {
    ...meta(2),
    seriesId: id(1),
    title: 'More than conquerors',
    date: '2026-10-04',
    kind: 'sermon',
    speaker: 'Pastor A',
    church: null,
    sourceType: 'sermon',
    sourceTitle: 'Sunday service',
    sourceAuthor: null,
    sourceUrl: 'https://www.youtube.com/watch?v=abc',
    sourceStartedAt: NOW,
    mainPassages: [ROM_8_28],
  },
  section: {
    ...meta(3),
    lessonId: id(2),
    parentId: null,
    orderKey: keyBetween(),
    body: emptyBody(),
    conflictOf: null,
    conflictDevice: null,
    sourceAt: NOW,
    sourcePage: null,
  },
  tag: { ...meta(4), name: 'grace', isSeeded: true },
  sectionTag: { ...meta(5), tagId: id(4), sectionId: id(3) },
  lessonTag: { ...meta(6), tagId: id(4), lessonId: id(2) },
  takeaway: { ...meta(7), lessonId: id(2), text: 'Nothing separates us.' },
  question: {
    ...meta(8),
    lessonId: id(2),
    text: 'What is foreknowledge?',
    splitFromId: null,
  },
  highlight: { ...meta(9), ref: ROM_8_28, colour: 'yellow', note: null, promotedSectionId: id(3) },
  memoryItem: {
    ...meta(10),
    ref: ROM_8_28,
    ease: 2.5,
    interval: 0,
    nextReviewAt: NOW,
    reviewCount: 0,
  },
  inboxItem: {
    ...meta(11),
    origin: 'share',
    ref: ROM_8_28,
    text: 'From Sunday',
    sourceUrl: 'https://www.bible.com/bible/3034/ROM.8.28.BSB',
    receivedAt: NOW,
    colour: null,
    importId: null,
    snoozedUntil: '2026-10-20',
    placedInSectionId: id(3),
  },
  inboxItemTag: { ...meta(14), tagId: id(4), inboxItemId: id(11) },
  questionEntry: {
    ...meta(12),
    questionId: id(8),
    lessonId: id(2),
    kind: 'answered',
    sectionId: id(3),
  },
  template: {
    ...meta(13),
    name: 'Sermon notes',
    structure: [
      { title: 'Main point' },
      { title: 'Points', children: [{ title: 'One' }, { title: 'Two' }] },
      { title: 'Response' },
    ],
  },
  passageVisit: { ...meta(15), book: 'ROM', startOrd: 45_008_000, endOrd: 45_008_999 },
  resurfaceDismissal: {
    ...meta(16),
    rule: 'year_ago',
    targetKey: id(2),
    until: '2027-10-19',
  },
};

describe('entity schemas', () => {
  it('cover the 17 synced entities', () => {
    expect(ENTITY_NAMES).toEqual(Object.keys(ROWS));
  });

  describe.each(ENTITY_NAMES)('%s', (entity) => {
    const schema = ENTITY_SCHEMAS[entity];
    const row = ROWS[entity] as Record<string, unknown>;

    it('accepts a valid row unchanged', () => {
      expect(schema.parse(row)).toEqual(row);
    });

    it('rejects a missing field, an unknown field and a userId', () => {
      for (const key of Object.keys(row)) {
        const { [key]: _omitted, ...rest } = row;
        expect({ key, ok: schema.safeParse(rest).success }).toEqual({ key, ok: false });
      }
      expect(schema.safeParse({ ...row, extra: 1 }).success).toBe(false);
      expect(schema.safeParse({ ...row, userId: id(99) }).success).toBe(false);
    });

    it('rejects a bigint or negative rev, and a timestamp with an offset', () => {
      expect(schema.safeParse({ ...row, rev: 3n }).success).toBe(false);
      expect(schema.safeParse({ ...row, rev: -1 }).success).toBe(false);
      expect(schema.safeParse({ ...row, updatedAt: '2026-10-13T06:05:06+02:00' }).success).toBe(
        false,
      );
    });
  });

  it.each([
    ['a UUIDv4 id', 'series', { id: '9b2f6f0e-8f5b-4b8e-9c3c-6a1f3d6c2b1a' }],
    ['an empty title', 'series', { title: '  ' }],
    ['an unknown series kind', 'series', { kind: 'podcast' }],
    ['a date with a time', 'lesson', { date: '2026-10-04T00:00:00Z' }],
    [
      'a main passage that does not exist',
      'lesson',
      { mainPassages: [{ ...ROM_8_28, verseStart: 40 }] },
    ],
    ['an invalid order key', 'section', { orderKey: 'a00' }],
    ['an invalid body', 'section', { body: { type: 'doc', content: [] } }],
    ['a tag name over 50 characters', 'tag', { name: 'x'.repeat(51) }],
    ['a question status, which its entries now give', 'question', { status: 'open' }],
    ['an unknown question entry kind', 'questionEntry', { kind: 'closed' }],
    ['a lesson source, which is its kind now', 'lesson', { source: 'sermon' }],
    ['a template name over 80 characters', 'template', { name: 'x'.repeat(81) }],
    ['a template with no sections', 'template', { structure: [] }],
    [
      'a default naming neither a built-in nor a template',
      'userSettings',
      { defaultTemplates: { sermon: 'soap', personal: null, group: null } },
    ],
    ['an unknown colour', 'highlight', { colour: 'red' }],
    ['an ease below 1.3', 'memoryItem', { ease: 1.2 }],
    ['a fractional interval', 'memoryItem', { interval: 1.5 }],
    ['an inbox item with neither a verse nor text', 'inboxItem', { ref: null, text: null }],
    ['an inbox item with only blank text', 'inboxItem', { ref: null, text: '  ' }],
    ['an unknown origin', 'inboxItem', { origin: 'email' }],
    ['a source address that is not http', 'inboxItem', { sourceUrl: 'javascript:alert(1)' }],
    ['a snooze with a time', 'inboxItem', { snoozedUntil: '2026-10-20T00:00:00Z' }],
    ['an unknown source type', 'lesson', { sourceType: 'video' }],
    ['a source link that is not a web address', 'lesson', { sourceUrl: 'youtube' }],
    ['a page over 20 characters', 'section', { sourcePage: 'x'.repeat(21) }],
    ['an unknown colour mode', 'userSettings', { colorMode: 'dim' }],
    ['a retired theme field', 'userSettings', { look: 'folio' }],
    ['a review window of 0 days', 'userSettings', { reviewWindowDays: 0 }],
    ['an unknown "Open in…" target', 'userSettings', { openInTargets: ['biblegateway'] }],
    ['an "Open in…" target twice', 'userSettings', { openInTargets: ['logos', 'logos'] }],
    [
      'a resurfacing rule left out',
      'userSettings',
      { resurfacing: { yearAgo: true, repeatedVerse: true } },
    ],
    ['a digest quarter that is not one', 'userSettings', { lastDigestQuarter: '2026-Q5' }],
    ['a visit to an unknown book', 'passageVisit', { book: 'XYZ' }],
    ['an unknown resurfacing rule', 'resurfaceDismissal', { rule: 'old_takeaway' }],
    ['a dismissal until a time', 'resurfaceDismissal', { until: '2027-10-19T00:00:00Z' }],
  ] as [string, EntityName, Record<string, unknown>][])('rejects %s', (_, entity, change) => {
    const row = { ...(ROWS[entity] as object), ...change };
    expect(ENTITY_SCHEMAS[entity].safeParse(row).success).toBe(false);
  });

  it('trims one-line text', () => {
    expect(tagSchema.parse({ ...(ROWS.tag as object), name: '  hope ' }).name).toBe('hope');
  });

  it('accepts every seeded tag as a tag name', () => {
    for (const name of SEED_TAGS)
      expect(tagSchema.parse({ ...(ROWS.tag as object), name }).name).toBe(name);
  });

  it('accepts a citation, which has no sync fields', () => {
    const citation = {
      id: id(20),
      sourceType: 'section',
      sourceId: id(3),
      lessonId: id(2),
      book: 'ROM',
      startOrd: 45_008_028,
      endOrd: 45_008_028,
    };
    expect(citationSchema.parse(citation)).toEqual(citation);
    expect(citationSchema.safeParse({ ...citation, rev: 1 }).success).toBe(false);
  });
});

describe('sync schemas', () => {
  const { rev: _rev, ...lessonRow } = ROWS.lesson as Record<string, unknown>;
  const upsert = {
    changeId: id(100),
    baseRev: 0,
    clientTime: NOW,
    entity: 'lesson',
    entityId: id(2),
    op: 'upsert',
    row: lessonRow,
  };
  const remove = {
    changeId: id(101),
    baseRev: 3,
    clientTime: NOW,
    entity: 'tag',
    entityId: id(4),
    op: 'delete',
  };
  const { rev: _settingsRev, ...settingsRow } = ROWS.userSettings as Record<string, unknown>;
  const settings = {
    changeId: id(102),
    baseRev: 1,
    clientTime: NOW,
    entity: 'userSettings',
    op: 'upsert',
    row: settingsRow,
  };

  it('accepts an upsert, a delete and a settings change', () => {
    expect(changeSchema.parse(upsert)).toEqual(upsert);
    expect(changeSchema.parse(remove)).toEqual(remove);
    expect(changeSchema.parse(settings)).toEqual(settings);
  });

  it("drops an older app's retired theme fields from a settings change", () => {
    const old = {
      ...settings,
      row: { ...settingsRow, themePreset: 'cedar', look: 'folio' },
      changed: ['look', 'colorMode'],
    };
    expect(changeSchema.parse(old)).toEqual({ ...settings, changed: ['colorMode'] });
  });

  it.each([
    ['a row id that differs from entityId', { ...upsert, entityId: id(9) }],
    ['a row with rev (the server assigns it)', { ...upsert, row: ROWS.lesson }],
    ['a row of another entity', { ...upsert, entity: 'tag' }],
    ['an upsert without a row', { ...remove, op: 'upsert' }],
    ['a delete with a row', { ...remove, row: ROWS.tag }],
    ['an unknown entity', { ...remove, entity: 'citation' }],
    ['an unknown op', { ...remove, op: 'patch' }],
    ['a settings delete', { ...settings, op: 'delete' }],
    ['a settings change with an entityId', { ...settings, entityId: id(1) }],
  ])('rejects a change with %s', (_, change) => {
    expect(changeSchema.safeParse(change).success).toBe(false);
  });

  it('checks that a pushed inbox item holds a verse or text', () => {
    const { rev: _itemRev, ...item } = ROWS.inboxItem as Record<string, unknown>;
    const change = { ...upsert, entity: 'inboxItem', entityId: id(11), row: item };
    expect(changeSchema.parse(change)).toEqual(change);
    expect(changeSchema.safeParse({ ...change, row: { ...item, ref: null } }).success).toBe(true);
    const empty = { ...change, row: { ...item, ref: null, text: null } };
    expect(changeSchema.safeParse(empty).success).toBe(false);
  });

  it('narrows a change by entity and op', () => {
    const change = changeSchema.parse(upsert);
    if (change.entity === 'lesson' && change.op === 'upsert') {
      expectTypeOf(change.row.mainPassages).toEqualTypeOf<VerseRef[]>();
    }
    expectTypeOf<Extract<Change, { op: 'delete' }>>().not.toHaveProperty('row');
    expectTypeOf<Extract<PulledRow, { entity: 'tag' }>['row']['name']>().toBeString();
  });

  it('limits a push to 1–100 changes', () => {
    const push = {
      deviceId: id(50),
      deviceName: 'Firefox on Linux',
      clientVersion: '0.1.0',
      changes: [upsert],
    };
    expect(pushRequestSchema.parse(push)).toEqual(push);
    expect(pushRequestSchema.safeParse({ ...push, changes: [] }).success).toBe(false);
    const many = Array.from({ length: 101 }, (_, i) => ({ ...remove, changeId: id(200 + i) }));
    expect(pushRequestSchema.safeParse({ ...push, changes: many.slice(0, 100) }).success).toBe(
      true,
    );
    expect(pushRequestSchema.safeParse({ ...push, changes: many }).success).toBe(false);
  });

  it('accepts each kind of push result', () => {
    const results = [
      { changeId: id(100), status: 'applied', rev: 4 },
      {
        changeId: id(101),
        status: 'conflict',
        rev: 5,
        resolution: 'conflicted-copy',
        copyId: id(30),
      },
      { changeId: id(102), status: 'rejected', errorCode: 'FORBIDDEN', message: 'Not your lesson' },
    ];
    expect(pushResponseSchema.parse({ results })).toEqual({ results });
    expect(
      pushResponseSchema.safeParse({ results: [{ ...results[1], resolution: 'merged' }] }).success,
    ).toBe(false);
  });

  it('reads the pull query from strings, with a default limit', () => {
    const v = {
      clientVersion: '0.1.0',
      deviceId: '0199e0a0-0000-7000-8000-000000000001',
      deviceName: 'Chrome on Android',
    };
    expect(pullQuerySchema.parse({ cursor: '120', ...v })).toEqual({
      cursor: 120,
      limit: 500,
      ...v,
    });
    expect(pullQuerySchema.parse({ cursor: '0', limit: '50', ...v })).toEqual({
      cursor: 0,
      limit: 50,
      ...v,
    });
    for (const query of [
      {},
      { cursor: '0' },
      { cursor: '0', clientVersion: 'new' },
      { cursor: '0', clientVersion: '0.1.0' },
      { cursor: '0', ...v, deviceId: 'phone' },
      { cursor: '-1', ...v },
      { cursor: 'x', ...v },
      { cursor: '1.5', ...v },
      { cursor: '0', limit: '501', ...v },
    ]) {
      expect({ query, ok: pullQuerySchema.safeParse(query).success }).toEqual({ query, ok: false });
    }
  });

  it('accepts a pull page with rows of every entity', () => {
    const page = {
      rows: ENTITY_NAMES.map((entity) => ({ entity, row: ROWS[entity] })),
      nextCursor: 3,
      hasMore: false,
      remaining: 12,
      serverTime: NOW,
      minClientVersion: '0.1.0',
    };
    expect(pullResponseSchema.parse(page)).toEqual(page);
    const wrong = { ...page, rows: [{ entity: 'tag', row: ROWS.lesson }] };
    expect(pullResponseSchema.safeParse(wrong).success).toBe(false);
  });
});

describe('auth schemas', () => {
  const token = 'A'.repeat(42) + '_';

  it('trims the email and keeps its case (the column is citext)', () => {
    expect(
      signupRequestSchema.parse({ email: ' Reader@Example.com ', password: 'long enough' }),
    ).toEqual({
      email: 'Reader@Example.com',
      password: 'long enough',
    });
  });

  it.each([
    ['an invalid email', signupRequestSchema, { email: 'reader', password: 'long enough' }],
    ['a password under 10 characters', signupRequestSchema, { email: 'a@b.co', password: 'short' }],
    [
      'a new password under 10 characters',
      changePasswordRequestSchema,
      { currentPassword: 'x', newPassword: 'short' },
    ],
    ['a reset with a short password', resetPasswordRequestSchema, { token, password: 'short' }],
    ['a token of the wrong length', verifyEmailRequestSchema, { token: 'abc' }],
    ['a token with other characters', verifyEmailRequestSchema, { token: '+'.repeat(43) }],
    ['an empty login password', loginRequestSchema, { email: 'a@b.co', password: '' }],
    ['a deletion without the password', deleteAccountRequestSchema, { password: '' }],
  ] as const)('rejects %s', (_, schema, body) => {
    expect(schema.safeParse(body).success).toBe(false);
  });

  it('lets any non-empty password try to log in', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(true);
    expect(deleteAccountRequestSchema.safeParse({ password: 'short' }).success).toBe(true);
    expect(verifyEmailRequestSchema.safeParse({ token }).success).toBe(true);
  });

  it('describes the signed-in user', () => {
    const me = { id: id(1), email: 'reader@example.com', emailVerifiedAt: null, role: 'user' };
    expect(meResponseSchema.parse(me)).toEqual(me);
    expect(meResponseSchema.safeParse({ ...me, passwordHash: 'x' }).success).toBe(false);
  });
});

describe('api schemas', () => {
  it('accepts health, errors and devices', () => {
    expect(healthResponseSchema.parse({ status: 'ok', version: '0.1.0' })).toBeDefined();
    const error = {
      statusCode: 400,
      errorCode: 'VALIDATION_FAILED',
      message: 'Bad',
      details: [{ path: 'x' }],
    };
    expect(apiErrorSchema.parse(error)).toEqual(error);
    const device = {
      id: '9b2f6f0e-8f5b-4b8e-9c3c-6a1f3d6c2b1a',
      name: 'Safari on iPhone',
      clientVersion: '0.1.0',
      createdAt: NOW,
      lastSyncAt: null,
    };
    expect(devicesResponseSchema.parse({ devices: [device] })).toEqual({ devices: [device] });
  });
});

describe('verseRefSchema', () => {
  it('takes text from outside, `shared` or `pasted`, with a version label (decision 63)', () => {
    for (const ref of [
      { ...ROM_8_28, translation: 'shared', versionLabel: 'NIV', snapshotText: 'And we know…' },
      { ...ROM_8_28, translation: 'shared' },
      { ...ROM_8_28, translation: 'pasted', snapshotText: 'And we know…' },
    ]) {
      expect(verseRefSchema.parse(ref)).toEqual(ref);
    }
  });

  it('refuses another translation, or a label that is empty or too long', () => {
    expect(verseRefSchema.safeParse({ ...ROM_8_28, translation: 'NIV' }).success).toBe(false);
    expect(verseRefSchema.safeParse({ ...ROM_8_28, versionLabel: ' ' }).success).toBe(false);
    expect(verseRefSchema.safeParse({ ...ROM_8_28, versionLabel: 'X'.repeat(17) }).success).toBe(
      false,
    );
  });
});
