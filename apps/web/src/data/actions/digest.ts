import {
  emptyBody,
  keysBetween,
  lastQuarter,
  newId,
  type Lesson,
  type Quarter,
  quarterDays,
  quarterLabel,
  type SectionBody,
} from '@lamp/domain';
import { hasText } from '@/components/sections/body.ts';
import { action } from '../action.ts';
import { db as appDb, type DigestDraft, type LampDb, SETTINGS_KEY } from '../db.ts';
import { digestFor, digestSections } from '../digest.ts';
import { linkTag, tagNamed } from './tags.ts';

/** The tag a kept digest gets (F32). */
export const DIGEST_TAG = 'digest';

/**
 * On the first open after a quarter ends (F32, M12-08): drafts the digest of the quarter that last
 * ended, once per account. Nothing for a quarter already drafted on any device (the synced
 * `lastDigestQuarter`), or with no lessons. The draft and the setting are written together.
 */
export async function draftDigest(today: string, db: LampDb = appDb): Promise<DigestDraft | null> {
  const quarter = lastQuarter(today);
  const drafted = async (from: LampDb) => {
    const last = (await from.userSettings.get(SETTINGS_KEY))?.lastDigestQuarter;
    return !!last && last >= quarter;
  };
  if (await drafted(db)) return null;
  // Read before the write, which locks every table: the screen's own reads needn't wait for it.
  const digest = await digestFor(quarter, db);
  if (!digest) return null;
  return action(db, async (w) => {
    // Another tab may have drafted it meanwhile.
    if (await drafted(w.db)) return null;
    const now = new Date().toISOString();
    const draft: DigestDraft = {
      quarter,
      title: digest.title,
      sections: [...digestSections(digest), emptyBody()].map((body) => ({ id: newId(), body })),
      createdAt: now,
      updatedAt: now,
    };
    await w.db.digestDraft.put(draft);
    await w.updateSettings({ lastDigestQuarter: quarter });
    return draft;
  });
}

/** The draft's title, as it's typed. */
export async function saveDraftTitle(quarter: Quarter, title: string, db: LampDb = appDb) {
  await db.digestDraft
    .where('quarter')
    .equals(quarter)
    .modify((draft) => {
      draft.title = title;
      draft.updatedAt = new Date().toISOString();
    });
}

/** One of the draft's sections, as it's typed. */
export async function saveDraftSection(
  quarter: Quarter,
  id: string,
  body: SectionBody,
  db: LampDb = appDb,
) {
  await db.transaction('rw', db.digestDraft, async () => {
    const draft = await db.digestDraft.get(quarter);
    if (!draft) return;
    const sections = draft.sections.map((s) => (s.id === id ? { id, body } : s));
    await db.digestDraft.put({ ...draft, sections, updatedAt: new Date().toISOString() });
  });
}

/** "Discard draft": at once, returning it for Undo. The quarter isn't drafted again. */
export async function discardDraft(
  quarter: Quarter,
  db: LampDb = appDb,
): Promise<DigestDraft | null> {
  return db.transaction('rw', db.digestDraft, async () => {
    const draft = await db.digestDraft.get(quarter);
    if (draft) await db.digestDraft.delete(quarter);
    return draft ?? null;
  });
}

/** Undo for "Discard draft". */
export async function restoreDraft(draft: DigestDraft, db: LampDb = appDb) {
  await db.digestDraft.put(draft);
}

/**
 * "Keep as a lesson": a personal lesson with the draft's title and its sections that have text,
 * dated the quarter's last day and tagged #digest. The draft goes in the same write.
 */
export function keepDigest(quarter: Quarter, db: LampDb = appDb): Promise<Lesson | null> {
  return action(db, async (w) => {
    const draft = await w.db.digestDraft.get(quarter);
    if (!draft) return null;
    const lesson = await w.create('lesson', {
      seriesId: null,
      title: draft.title.trim() || quarterLabel(quarter),
      date: quarterDays(quarter)[1],
      kind: 'personal',
      speaker: null,
      church: null,
      sourceType: null,
      sourceTitle: null,
      sourceAuthor: null,
      sourceUrl: null,
      sourceStartedAt: null,
      mainPassages: [],
    });
    const bodies = draft.sections.map((s) => s.body).filter(hasText);
    const keys = keysBetween(null, null, bodies.length);
    for (const [i, body] of bodies.entries()) {
      await w.create('section', {
        lessonId: lesson.id,
        parentId: null,
        orderKey: keys[i]!,
        body,
        conflictOf: null,
        conflictDevice: null,
        sourceAt: null,
        sourcePage: null,
      });
    }
    await linkTag(w, { kind: 'lesson', id: lesson.id }, (await tagNamed(w, DIGEST_TAG)).id);
    await w.db.digestDraft.delete(quarter);
    return lesson;
  });
}
