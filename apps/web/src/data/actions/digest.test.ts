import { emptyBody, toPlainText } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportDigestDraft } from '@/export/load.ts';
import { LampDb, SETTINGS_KEY } from '../db.ts';
import { lessonSections, tagsOf } from '../queries.ts';
import { ensureDevice } from '../setup.ts';
import { discardDraft, draftDigest, keepDigest, restoreDraft, saveDraftSection } from './digest.ts';
import { createLesson } from './lessons.ts';
import { updateSettings } from './settings.ts';

let db: LampDb;
let dbCount = 0;

beforeEach(async () => {
  db = new LampDb(`digest-draft-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { colorMode: 'system' });
});

afterEach(async () => {
  await db.delete();
});

const lessonOn = (title: string, date: string) =>
  createLesson(
    {
      seriesId: null,
      title,
      date,
      kind: 'sermon',
      speaker: null,
      church: null,
      sourceType: null,
      sourceTitle: null,
      sourceAuthor: null,
      sourceUrl: null,
      sourceStartedAt: null,
      mainPassages: [],
    },
    db,
  );

const setting = async () => (await db.userSettings.get(SETTINGS_KEY))?.lastDigestQuarter;

describe('the digest draft (M12-08)', () => {
  it('is drafted once for the quarter that last ended, and noted for the account', async () => {
    await lessonOn('The Good Shepherd', '2026-09-27');
    const draft = (await draftDigest('2026-10-19', db))!;
    expect(draft.quarter).toBe('2026-Q3');
    expect(draft.title).toBe('July–September 2026');
    expect(draft.sections.map((s) => toPlainText(s.body).split('\n')[0])).toEqual([
      'Lessons and series',
      'Top tags',
      'Questions',
      'Memory verses',
      'Commentaries that grew',
      // Empty, for a note of one's own.
      '',
    ]);
    expect(await setting()).toBe('2026-Q3');
    // The setting is a synced change, so other devices hear of it.
    expect(await db.outbox.filter((c) => c.entity === 'userSettings').count()).toBeGreaterThan(0);

    // Discarded, it isn't drafted again; nor on the next open.
    await discardDraft('2026-Q3', db);
    expect(await draftDigest('2026-10-20', db)).toBeNull();
    expect(await db.digestDraft.count()).toBe(0);
  });

  it('isn’t drafted where another device drafted it, nor for a quarter with no lessons', async () => {
    await lessonOn('The Good Shepherd', '2026-09-27');
    // As a pull from the device that drafted it leaves the settings.
    await updateSettings({ lastDigestQuarter: '2026-Q3' }, db);
    expect(await draftDigest('2026-10-19', db)).toBeNull();

    expect(await draftDigest('2027-01-02', db)).toBeNull();
    expect(await setting()).toBe('2026-Q3');
  });

  it('keeps as a personal lesson dated the quarter’s last day, tagged #digest', async () => {
    await lessonOn('The Good Shepherd', '2026-09-27');
    const draft = (await draftDigest('2026-10-19', db))!;
    const note = draft.sections.at(-1)!;
    await saveDraftSection(
      '2026-Q3',
      note.id,
      {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A good quarter.' }] }],
      },
      db,
    );
    // A section emptied of everything is left out.
    await saveDraftSection('2026-Q3', draft.sections[3]!.id, emptyBody(), db);

    const exported = (await exportDigestDraft('2026-Q3', db))!;
    expect(exported.fileName).toBe('2026-09-30-july-september-2026.md');
    expect(exported.markdown).toMatch(
      /^# July–September 2026\n\nWednesday 30 September 2026 · Personal\\\n#digest\n/,
    );
    expect(exported.markdown).toContain('A good quarter.');

    const lesson = (await keepDigest('2026-Q3', db))!;
    expect(lesson).toMatchObject({
      title: 'July–September 2026',
      date: '2026-09-30',
      kind: 'personal',
    });
    expect((await tagsOf({ kind: 'lesson', id: lesson.id }, db)).map((t) => t.tag.name)).toEqual([
      'digest',
    ]);
    const sections = await lessonSections(lesson.id, db);
    expect(sections.map((s) => toPlainText(s.body).split('\n')[0]).toSorted()).toEqual(
      [
        'A good quarter.',
        'Commentaries that grew',
        'Lessons and series',
        'Questions',
        'Top tags',
      ].toSorted(),
    );
    expect(await db.digestDraft.count()).toBe(0);
  });

  it('comes back with Undo after Discard', async () => {
    await lessonOn('The Good Shepherd', '2026-09-27');
    await draftDigest('2026-10-19', db);
    const gone = (await discardDraft('2026-Q3', db))!;
    await restoreDraft(gone, db);
    expect((await db.digestDraft.get('2026-Q3'))?.title).toBe('July–September 2026');
  });
});
