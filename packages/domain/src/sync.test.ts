import { describe, expect, it } from 'vitest';
import type { SectionBody } from './doc.ts';
import { keyBetween } from './order.ts';
import {
  conflictedCopy,
  PARENT_COLUMNS,
  resolveDelete,
  resolveUpsert,
  sameJson,
  type SyncRow,
} from './sync.ts';

const EARLY = '2026-10-13T09:00:00.000Z';
const BASE = '2026-10-13T10:00:00.000Z';
const LATE = '2026-10-13T11:00:00.000Z';
const DELETED = '2026-10-13T10:30:00.000Z';

const text = (t: string): SectionBody => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }],
});

const section = (fields: Partial<SyncRow<'section'>> = {}): SyncRow<'section'> => ({
  id: '0199e0a0-0000-7000-8000-00000000000a',
  lessonId: '0199e0a0-0000-7000-8000-00000000000b',
  parentId: null,
  orderKey: 'a0',
  body: text('base'),
  conflictOf: null,
  conflictDevice: null,
  createdAt: EARLY,
  updatedAt: BASE,
  deletedAt: null,
  ...fields,
});

const takeaway = (fields: Partial<SyncRow<'takeaway'>> = {}): SyncRow<'takeaway'> => ({
  id: '0199e0a0-0000-7000-8000-00000000000c',
  lessonId: '0199e0a0-0000-7000-8000-00000000000b',
  text: 'base',
  createdAt: EARLY,
  updatedAt: BASE,
  deletedAt: null,
  ...fields,
});

/** A change built on rev 3 of a row the server has since written at rev 5. */
const stale = { baseRev: 3, serverRev: 5 };

describe('resolveUpsert', () => {
  describe('no conflict', () => {
    it('stores a new row as sent', () => {
      const incoming = takeaway({ text: 'new' });
      expect(resolveUpsert({ server: null, serverRev: 0, baseRev: 0, incoming })).toEqual({
        row: incoming,
        resolution: null,
        keepsClientEdit: true,
      });
    });

    it('writes the edited fields when baseRev is current', () => {
      const server = takeaway();
      const incoming = takeaway({ text: 'edited', updatedAt: LATE });
      const outcome = resolveUpsert({
        server,
        serverRev: 3,
        baseRev: 3,
        incoming,
        changed: ['text', 'updatedAt'],
      });
      expect(outcome).toEqual({ row: incoming, resolution: null, keepsClientEdit: true });
    });

    it('takes every field when the change lists none', () => {
      const incoming = section({ orderKey: 'a1', body: text('edited'), updatedAt: LATE });
      const outcome = resolveUpsert({ server: section(), serverRev: 3, baseRev: 3, incoming });
      expect(outcome.row).toEqual(incoming);
    });
  });

  describe('both sides changed the row: last write wins', () => {
    it('the device wins when its write is later, and only with the fields it edited', () => {
      const server = takeaway({ text: 'from the laptop', lessonId: 'moved', updatedAt: BASE });
      const incoming = takeaway({ text: 'from the phone', updatedAt: LATE });
      const outcome = resolveUpsert({ ...stale, server, incoming, changed: ['text', 'updatedAt'] });
      expect(outcome).toEqual({
        row: { ...server, text: 'from the phone', updatedAt: LATE },
        resolution: 'client-won',
        keepsClientEdit: true,
      });
    });

    it('the server wins when its write is later, and the change is discarded', () => {
      const server = takeaway({ text: 'from the laptop', updatedAt: LATE });
      const incoming = takeaway({ text: 'from the phone', updatedAt: BASE });
      expect(resolveUpsert({ ...stale, server, incoming, changed: ['text'] })).toEqual({
        row: server,
        resolution: 'server-won',
        keepsClientEdit: false,
      });
    });

    it('a tie goes to the server', () => {
      const server = takeaway({ text: 'from the laptop', updatedAt: LATE });
      const incoming = takeaway({ text: 'from the phone', updatedAt: LATE });
      expect(resolveUpsert({ ...stale, server, incoming }).resolution).toBe('server-won');
    });

    it('applies to settings, which have no tombstone', () => {
      const settings: SyncRow<'userSettings'> = {
        colorMode: 'system',
        defaultTranslation: 'BSB',
        reviewWindowDays: 14,
        autoPreviewVerses: false,
        pasteChips: true,
        openInTargets: ['blueletterbible', 'youversion', 'biblehub', 'logos'],
        updatedAt: BASE,
      };
      const server: SyncRow<'userSettings'> = { ...settings, colorMode: 'dark' };
      const incoming = { ...settings, reviewWindowDays: 7, updatedAt: LATE };
      const outcome = resolveUpsert({
        ...stale,
        server,
        incoming,
        changed: ['reviewWindowDays', 'updatedAt'],
      });
      expect(outcome).toMatchObject({
        row: { colorMode: 'dark', reviewWindowDays: 7, updatedAt: LATE },
        resolution: 'client-won',
      });
    });
  });

  describe('a section body changed on both sides', () => {
    const server = section({ body: text('typed on the laptop'), updatedAt: BASE });
    const both = { ...stale, serverBodyChanged: true, changed: ['body', 'updatedAt'] };

    it('the later body stays and the older one becomes a copy: device later', () => {
      const incoming = section({ body: text('typed on the phone'), updatedAt: LATE });
      expect(resolveUpsert({ ...both, server, incoming })).toEqual({
        row: { ...server, body: text('typed on the phone'), updatedAt: LATE },
        resolution: 'conflicted-copy',
        copy: { body: text('typed on the laptop'), time: BASE, from: 'server' },
        keepsClientEdit: true,
      });
    });

    it('the later body stays and the older one becomes a copy: server later', () => {
      const incoming = section({ body: text('typed on the phone'), updatedAt: EARLY });
      expect(resolveUpsert({ ...both, server, incoming })).toEqual({
        row: server,
        resolution: 'conflicted-copy',
        copy: { body: text('typed on the phone'), time: EARLY, from: 'device' },
        keepsClientEdit: true,
      });
    });

    it('the same body typed on both sides is no conflict of bodies', () => {
      const incoming = section({ body: text('typed on the laptop'), updatedAt: LATE });
      const outcome = resolveUpsert({ ...both, server, incoming });
      expect(outcome.resolution).toBe('client-won');
      expect(outcome.copy).toBeUndefined();
    });

    it('a body the device sent but did not edit never replaces the stored one', () => {
      // The phone moved the section while the laptop typed into it.
      const incoming = section({ orderKey: 'a5', updatedAt: LATE });
      const outcome = resolveUpsert({
        ...stale,
        serverBodyChanged: true,
        server,
        incoming,
        changed: ['orderKey', 'updatedAt'],
      });
      expect(outcome).toEqual({
        row: { ...server, orderKey: 'a5', updatedAt: LATE },
        resolution: 'client-won',
        keepsClientEdit: true,
      });
    });

    it('a body only the device edited is kept, even when the server wrote later', () => {
      // The laptop moved the section later; only the phone typed.
      const moved = section({ orderKey: 'a5', updatedAt: LATE });
      const incoming = section({ body: text('typed on the phone'), updatedAt: BASE });
      const outcome = resolveUpsert({
        ...stale,
        serverBodyChanged: false,
        server: moved,
        incoming,
        changed: ['body', 'updatedAt'],
      });
      expect(outcome).toEqual({
        row: { ...moved, body: text('typed on the phone') },
        resolution: 'server-won',
        keepsClientEdit: true,
      });
    });

    it('a change that lists no fields counts as a body edit', () => {
      const incoming = section({ body: text('typed on the phone'), updatedAt: LATE });
      const outcome = resolveUpsert({ ...stale, serverBodyChanged: true, server, incoming });
      expect(outcome.resolution).toBe('conflicted-copy');
    });
  });

  describe('one side deleted, the other edited: the edit wins', () => {
    it('a row deleted on the server is restored with the edit', () => {
      const server = takeaway({ deletedAt: DELETED, updatedAt: DELETED });
      const incoming = takeaway({ text: 'edited offline', updatedAt: BASE });
      const outcome = resolveUpsert({ ...stale, server, incoming, changed: ['text', 'updatedAt'] });
      expect(outcome).toEqual({
        row: { ...server, text: 'edited offline', updatedAt: BASE, deletedAt: null },
        resolution: 'edit-won',
        keepsClientEdit: true,
      });
    });

    it('a section deleted on the server comes back with its edited body, and no copy', () => {
      const server = section({ body: text('laptop'), deletedAt: DELETED, updatedAt: DELETED });
      const incoming = section({ body: text('phone'), updatedAt: BASE });
      const outcome = resolveUpsert({ ...stale, serverBodyChanged: true, server, incoming });
      expect(outcome).toMatchObject({ row: { body: text('phone'), deletedAt: null } });
      expect(outcome.resolution).toBe('edit-won');
      expect(outcome.copy).toBeUndefined();
    });
  });
});

describe('resolveDelete', () => {
  it('leaves a tombstone when baseRev is current', () => {
    const server = takeaway();
    expect(resolveDelete({ server, serverRev: 3, baseRev: 3, time: LATE })).toEqual({
      row: { ...server, deletedAt: LATE, updatedAt: LATE },
      resolution: null,
      keepsClientEdit: false,
    });
  });

  it('keeps the first deletion time of a row deleted again', () => {
    const server = takeaway({ deletedAt: DELETED });
    const outcome = resolveDelete({ server, serverRev: 3, baseRev: 3, time: LATE });
    expect(outcome.row).toMatchObject({ deletedAt: DELETED, updatedAt: LATE });
  });

  it('a row edited on the server since baseRev keeps the edit', () => {
    const server = takeaway({ text: 'edited on the laptop', updatedAt: BASE });
    expect(resolveDelete({ ...stale, server, time: LATE })).toEqual({
      row: server,
      resolution: 'edit-won',
      keepsClientEdit: false,
    });
  });

  it('both sides deleted: nothing changes', () => {
    const server = takeaway({ deletedAt: DELETED, updatedAt: DELETED });
    expect(resolveDelete({ ...stale, server, time: LATE })).toEqual({
      row: server,
      resolution: 'already-deleted',
      keepsClientEdit: false,
    });
  });
});

describe('PARENT_COLUMNS', () => {
  it('names the rows that content sits under', () => {
    expect(PARENT_COLUMNS.section).toEqual(['lessonId', 'parentId']);
    expect(PARENT_COLUMNS.sectionTag).toEqual(['tagId', 'sectionId']);
    expect(PARENT_COLUMNS.question).toEqual(['lessonId']);
    expect(PARENT_COLUMNS.questionEntry).toEqual(['questionId', 'lessonId']);
    expect(PARENT_COLUMNS.highlight).toEqual([]);
  });
});

describe('conflictedCopy', () => {
  it('is a sibling right after the section, pointing back at it', () => {
    const original = section({ parentId: '0199e0a0-0000-7000-8000-00000000000d', orderKey: 'a0' });
    const orderKey = keyBetween('a0', 'a1');
    const copy = conflictedCopy(
      original,
      { body: text('older'), time: EARLY, device: 'Firefox on macOS' },
      '0199e0a0-0000-7000-8000-00000000000e',
      orderKey,
    );
    expect(copy).toEqual({
      id: '0199e0a0-0000-7000-8000-00000000000e',
      lessonId: original.lessonId,
      parentId: original.parentId,
      orderKey,
      body: text('older'),
      conflictOf: original.id,
      conflictDevice: 'Firefox on macOS',
      createdAt: EARLY,
      updatedAt: EARLY,
      deletedAt: null,
    });
    expect(orderKey > 'a0' && orderKey < 'a1').toBe(true);
  });
});

describe('sameJson', () => {
  it.each([
    [{ a: 1, b: [1, { c: 'x' }] }, { b: [1, { c: 'x' }], a: 1 }, true],
    [{ a: 1 }, { a: 1, b: 2 }, false],
    [{ a: 1, b: undefined }, { a: 1, c: undefined }, false],
    [[1, 2], [2, 1], false],
    [[], {}, false],
    [null, {}, false],
    ['x', 'x', true],
  ])('%j and %j: %s', (a, b, same) => {
    expect(sameJson(a, b)).toBe(same);
  });
});
