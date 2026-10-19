import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { createPrisma, truncateAll } from './int/db.js';

const prisma: PrismaClient = createPrisma();

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await truncateAll(prisma);
});

const newUser = (email = 'reader@example.com') =>
  prisma.user.create({ data: { email, passwordHash: 'x' } });

async function newLesson(userId: string) {
  return prisma.lesson.create({ data: { userId, title: 'Lesson', date: new Date('2026-10-04') } });
}

async function newSection(
  userId: string,
  lessonId: string,
  extra: { parentId?: string; orderKey?: string } = {},
) {
  return prisma.section.create({
    data: { userId, lessonId, orderKey: 'a0', body: { type: 'doc', content: [] }, ...extra },
  });
}

describe('migrations', () => {
  it('leave the database matching schema.prisma', () => {
    // --exit-code: 0 = no difference, 2 = difference (execFileSync throws with the diff).
    const diff = ['--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code'];
    expect(() =>
      execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'diff', ...diff], { stdio: 'pipe' }),
    ).not.toThrow();
  });
});

describe('user email', () => {
  it('is unique ignoring case (citext)', async () => {
    await newUser('Reader@Example.com');
    await expect(newUser('reader@EXAMPLE.com')).rejects.toMatchObject({ code: 'P2002' });
  });

  it('is found ignoring case', async () => {
    const user = await newUser('Reader@Example.com');
    await expect(
      prisma.user.findUnique({ where: { email: 'READER@example.COM' } }),
    ).resolves.toMatchObject({
      id: user.id,
    });
  });
});

describe('tag names', () => {
  it('are unique per user ignoring case among live tags', async () => {
    const { id: userId } = await newUser();
    await prisma.tag.create({ data: { userId, name: 'Grace' } });
    await expect(prisma.tag.create({ data: { userId, name: 'grace' } })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('can be reused once the old tag is deleted', async () => {
    const { id: userId } = await newUser();
    await prisma.tag.create({ data: { userId, name: 'grace', deletedAt: new Date() } });
    await expect(prisma.tag.create({ data: { userId, name: 'Grace' } })).resolves.toBeDefined();
  });

  it('can repeat across users', async () => {
    const a = await newUser('a@example.com');
    const b = await newUser('b@example.com');
    await prisma.tag.create({ data: { userId: a.id, name: 'grace' } });
    await expect(
      prisma.tag.create({ data: { userId: b.id, name: 'grace' } }),
    ).resolves.toBeDefined();
  });
});

describe('tag links', () => {
  it('allow one live link per section and tag, and re-adding after a delete', async () => {
    const { id: userId } = await newUser();
    const lesson = await newLesson(userId);
    const section = await newSection(userId, lesson.id);
    const tag = await prisma.tag.create({ data: { userId, name: 'grace' } });
    const link = { userId, sectionId: section.id, tagId: tag.id };

    const first = await prisma.sectionTag.create({ data: link });
    await expect(prisma.sectionTag.create({ data: link })).rejects.toMatchObject({ code: 'P2002' });
    await prisma.sectionTag.update({ where: { id: first.id }, data: { deletedAt: new Date() } });
    await expect(prisma.sectionTag.create({ data: link })).resolves.toBeDefined();
  });

  it('allow one live link per lesson and tag', async () => {
    const { id: userId } = await newUser();
    const lesson = await newLesson(userId);
    const tag = await prisma.tag.create({ data: { userId, name: 'grace' } });
    const link = { userId, lessonId: lesson.id, tagId: tag.id };
    await prisma.lessonTag.create({ data: link });
    await expect(prisma.lessonTag.create({ data: link })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('allow one live link per inbox item and tag', async () => {
    const { id: userId } = await newUser();
    const item = await prisma.inboxItem.create({
      data: { userId, origin: 'typed', receivedAt: new Date(), text: 'x' },
    });
    const tag = await prisma.tag.create({ data: { userId, name: 'grace' } });
    const link = { userId, inboxItemId: item.id, tagId: tag.id };
    const first = await prisma.inboxItemTag.create({ data: link });
    await expect(prisma.inboxItemTag.create({ data: link })).rejects.toMatchObject({
      code: 'P2002',
    });
    await prisma.inboxItemTag.update({ where: { id: first.id }, data: { deletedAt: new Date() } });
    await expect(prisma.inboxItemTag.create({ data: link })).resolves.toBeDefined();
  });
});

describe('check constraints', () => {
  it('reject values outside the enum-like lists', async () => {
    const { id: userId } = await newUser();
    const lesson = await newLesson(userId);
    await expect(
      prisma.user.create({ data: { email: 'x@example.com', passwordHash: 'x', role: 'root' } }),
    ).rejects.toThrow(/user_role_check/);
    await expect(
      prisma.highlight.create({ data: { userId, ref: {}, colour: 'purple' } }),
    ).rejects.toThrow(/highlight_colour_check/);
    await expect(
      prisma.question.create({
        data: { userId, lessonId: lesson.id, text: '?', status: 'closed' },
      }),
    ).rejects.toThrow(/question_status_check/);
    await expect(
      prisma.lesson.create({ data: { userId, title: 'x', date: new Date(), mainPassages: {} } }),
    ).rejects.toThrow(/lesson_main_passages_check/);
    await expect(
      prisma.lesson.create({ data: { userId, title: 'x', date: new Date(), kind: 'podcast' } }),
    ).rejects.toThrow(/lesson_kind_check/);
    await expect(
      prisma.lesson.create({
        data: { userId, title: 'x', date: new Date(), sourceType: 'video' },
      }),
    ).rejects.toThrow(/lesson_source_type_check/);
    await expect(
      prisma.template.create({ data: { userId, name: 'x', structure: { title: 'x' } } }),
    ).rejects.toThrow(/template_structure_check/);
    await expect(
      prisma.userSettings.create({ data: { userId, defaultTemplates: [] } }),
    ).rejects.toThrow(/user_settings_default_templates_check/);
    await expect(prisma.userSettings.create({ data: { userId, resurfacing: [] } })).rejects.toThrow(
      /user_settings_resurfacing_check/,
    );
    await expect(
      prisma.userSettings.create({ data: { userId, lastDigestQuarter: '2026-Q5' } }),
    ).rejects.toThrow(/user_settings_last_digest_quarter_check/);
    await expect(
      prisma.resurfaceDismissal.create({
        data: { userId, rule: 'old_takeaway', targetKey: 'x', until: new Date() },
      }),
    ).rejects.toThrow(/resurface_dismissal_rule_check/);
    const item = { userId, origin: 'share', receivedAt: new Date(), text: 'x' };
    await expect(prisma.inboxItem.create({ data: { ...item, origin: 'email' } })).rejects.toThrow(
      /inbox_item_origin_check/,
    );
    await expect(prisma.inboxItem.create({ data: { ...item, colour: 'purple' } })).rejects.toThrow(
      /inbox_item_colour_check/,
    );
    const question = await prisma.question.create({
      data: { userId, lessonId: lesson.id, text: '?' },
    });
    await expect(
      prisma.questionEntry.create({
        data: { userId, questionId: question.id, lessonId: lesson.id, kind: 'closed' },
      }),
    ).rejects.toThrow(/question_entry_kind_check/);
    const section = await newSection(userId, lesson.id);
    await expect(
      prisma.link.create({
        data: {
          userId,
          fromSectionId: section.id,
          fromLessonId: lesson.id,
          targetType: 'tag',
          targetId: lesson.id,
        },
      }),
    ).rejects.toThrow(/link_target_type_check/);
  });

  it('reject an inbox item with neither a verse nor text', async () => {
    const { id: userId } = await newUser();
    await expect(
      prisma.inboxItem.create({ data: { userId, origin: 'typed', receivedAt: new Date() } }),
    ).rejects.toThrow(/inbox_item_ref_or_text_check/);
  });

  it('reject a citation whose range ends before it starts', async () => {
    const { id: userId } = await newUser();
    await expect(
      prisma.citation.create({
        data: {
          userId,
          sourceType: 'highlight',
          sourceId: userId,
          book: 'ROM',
          startOrd: 45008030,
          endOrd: 45008028,
        },
      }),
    ).rejects.toThrow(/citation_ord_check/);
  });
});

describe('section order keys', () => {
  it('sort byte by byte ("C" collation), as fractional keys need', async () => {
    const { id: userId } = await newUser();
    const lesson = await newLesson(userId);
    for (const orderKey of ['a1', 'Zz', 'a0']) await newSection(userId, lesson.id, { orderKey });
    const sections = await prisma.section.findMany({
      where: { lessonId: lesson.id },
      orderBy: { orderKey: 'asc' },
    });
    expect(sections.map((s) => s.orderKey)).toEqual(['Zz', 'a0', 'a1']);
  });
});

describe('deletes', () => {
  it('of a user remove every row they own', async () => {
    const user = await newUser();
    const other = await newUser('other@example.com');
    const userId = user.id;
    const series = await prisma.series.create({ data: { userId, title: 'Series' } });
    const lesson = await prisma.lesson.create({
      data: { userId, seriesId: series.id, title: 'Lesson', date: new Date() },
    });
    const section = await newSection(userId, lesson.id);
    const tag = await prisma.tag.create({ data: { userId, name: 'grace' } });
    const question = await prisma.question.create({
      data: { userId, lessonId: lesson.id, text: 'q' },
    });
    await prisma.$transaction([
      prisma.session.create({ data: { userId, tokenHash: 'h1', expiresAt: new Date() } }),
      prisma.questionEntry.create({
        data: { userId, questionId: question.id, lessonId: lesson.id, kind: 'asked' },
      }),
      prisma.link.create({
        data: {
          userId,
          fromSectionId: section.id,
          fromLessonId: lesson.id,
          targetType: 'lesson',
          targetId: lesson.id,
        },
      }),
      prisma.emailToken.create({
        data: { userId, kind: 'verify', tokenHash: 'h2', expiresAt: new Date() },
      }),
      prisma.userSettings.create({ data: { userId } }),
      prisma.sectionTag.create({ data: { userId, sectionId: section.id, tagId: tag.id } }),
      prisma.lessonTag.create({ data: { userId, lessonId: lesson.id, tagId: tag.id } }),
      prisma.takeaway.create({ data: { userId, lessonId: lesson.id, text: 't' } }),
      prisma.question.create({ data: { userId, lessonId: lesson.id, text: 'q' } }),
      prisma.highlight.create({ data: { userId, ref: {}, colour: 'yellow' } }),
      prisma.memoryItem.create({ data: { userId, ref: {} } }),
      prisma.inboxItem.create({
        data: {
          userId,
          origin: 'share',
          receivedAt: new Date(),
          text: 't',
          tags: { create: { userId, tagId: tag.id } },
        },
      }),
      prisma.passageVisit.create({ data: { userId, book: 'ROM', startOrd: 1, endOrd: 2 } }),
      prisma.resurfaceDismissal.create({
        data: { userId, rule: 'year_ago', targetKey: lesson.id, until: new Date('2027-10-19') },
      }),
      prisma.citation.create({
        data: {
          userId,
          sourceType: 'section',
          sourceId: section.id,
          lessonId: lesson.id,
          book: 'ROM',
          startOrd: 1,
          endOrd: 2,
        },
      }),
      prisma.syncChange.create({
        data: { id: crypto.randomUUID(), userId, deviceId: crypto.randomUUID(), status: 'applied' },
      }),
      prisma.device.create({
        data: { id: crypto.randomUUID(), userId, name: 'Phone', clientVersion: '0.0.0' },
      }),
    ]);
    await newLesson(other.id);

    await prisma.user.delete({ where: { id: userId } });

    const where = { userId };
    const counts = await Promise.all([
      prisma.session.count({ where }),
      prisma.emailToken.count({ where }),
      prisma.userSettings.count({ where }),
      prisma.series.count({ where }),
      prisma.lesson.count({ where }),
      prisma.section.count({ where }),
      prisma.tag.count({ where }),
      prisma.sectionTag.count({ where }),
      prisma.lessonTag.count({ where }),
      prisma.takeaway.count({ where }),
      prisma.question.count({ where }),
      prisma.questionEntry.count({ where }),
      prisma.link.count({ where }),
      prisma.highlight.count({ where }),
      prisma.memoryItem.count({ where }),
      prisma.inboxItem.count({ where }),
      prisma.inboxItemTag.count({ where }),
      prisma.passageVisit.count({ where }),
      prisma.resurfaceDismissal.count({ where }),
      prisma.citation.count({ where }),
      prisma.syncChange.count({ where }),
      prisma.device.count({ where }),
    ]);
    expect(counts.every((n) => n === 0)).toBe(true);
    await expect(prisma.lesson.count({ where: { userId: other.id } })).resolves.toBe(1);
  });

  it('of a lesson remove its sections, tag links, takeaways, questions, entries, citations and links', async () => {
    const { id: userId } = await newUser();
    const lesson = await newLesson(userId);
    const other = await newLesson(userId);
    const elsewhere = await prisma.question.create({
      data: { userId, lessonId: other.id, text: 'Asked elsewhere' },
    });
    // Revisited in the lesson being deleted: the entry goes with it, the question stays.
    await prisma.questionEntry.create({
      data: { userId, questionId: elsewhere.id, lessonId: lesson.id, kind: 'revisited' },
    });
    const parent = await newSection(userId, lesson.id);
    await prisma.link.create({
      data: {
        userId,
        fromSectionId: parent.id,
        fromLessonId: lesson.id,
        targetType: 'lesson',
        targetId: other.id,
      },
    });
    await newSection(userId, lesson.id, { parentId: parent.id });
    const tag = await prisma.tag.create({ data: { userId, name: 'grace' } });
    await prisma.lessonTag.create({ data: { userId, lessonId: lesson.id, tagId: tag.id } });
    await prisma.sectionTag.create({ data: { userId, sectionId: parent.id, tagId: tag.id } });
    await prisma.takeaway.create({ data: { userId, lessonId: lesson.id, text: 't' } });
    await prisma.question.create({ data: { userId, lessonId: lesson.id, text: 'q' } });
    await prisma.citation.create({
      data: {
        userId,
        sourceType: 'lesson',
        sourceId: lesson.id,
        lessonId: lesson.id,
        book: 'ROM',
        startOrd: 1,
        endOrd: 2,
      },
    });

    await prisma.lesson.delete({ where: { id: lesson.id } });

    await expect(prisma.section.count()).resolves.toBe(0);
    await expect(prisma.lessonTag.count()).resolves.toBe(0);
    await expect(prisma.sectionTag.count()).resolves.toBe(0);
    await expect(prisma.takeaway.count()).resolves.toBe(0);
    await expect(prisma.question.count()).resolves.toBe(1);
    await expect(prisma.questionEntry.count()).resolves.toBe(0);
    await expect(prisma.citation.count()).resolves.toBe(0);
    await expect(prisma.link.count()).resolves.toBe(0);
    await expect(prisma.tag.count()).resolves.toBe(1);
  });

  it('of a series keep its lessons, without the series', async () => {
    const { id: userId } = await newUser();
    const series = await prisma.series.create({ data: { userId, title: 'Romans' } });
    const lesson = await prisma.lesson.create({
      data: { userId, seriesId: series.id, title: 'Lesson', date: new Date() },
    });
    await prisma.series.delete({ where: { id: series.id } });
    await expect(prisma.lesson.findUnique({ where: { id: lesson.id } })).resolves.toMatchObject({
      seriesId: null,
    });
  });

  it('of a section unlink the questions, entries, highlights, inbox items and conflicted copies that point at it', async () => {
    const { id: userId } = await newUser();
    const lesson = await newLesson(userId);
    const section = await newSection(userId, lesson.id);
    const copy = await prisma.section.create({
      data: { userId, lessonId: lesson.id, orderKey: 'a1', body: {}, conflictOf: section.id },
    });
    const question = await prisma.question.create({
      data: {
        userId,
        lessonId: lesson.id,
        text: 'q',
        answerSectionId: section.id,
        status: 'answered',
      },
    });
    const entry = await prisma.questionEntry.create({
      data: {
        userId,
        questionId: question.id,
        lessonId: lesson.id,
        kind: 'answered',
        sectionId: section.id,
      },
    });
    const highlight = await prisma.highlight.create({
      data: { userId, ref: {}, colour: 'green', promotedSectionId: section.id },
    });
    await prisma.link.create({
      data: {
        userId,
        fromSectionId: section.id,
        fromLessonId: lesson.id,
        targetType: 'lesson',
        targetId: lesson.id,
      },
    });

    const item = await prisma.inboxItem.create({
      data: {
        userId,
        origin: 'typed',
        text: 'x',
        receivedAt: new Date(),
        placedInSectionId: section.id,
      },
    });

    await prisma.section.delete({ where: { id: section.id } });

    await expect(prisma.question.findUnique({ where: { id: question.id } })).resolves.toMatchObject(
      {
        answerSectionId: null,
      },
    );
    await expect(
      prisma.questionEntry.findUnique({ where: { id: entry.id } }),
    ).resolves.toMatchObject({ sectionId: null });
    await expect(prisma.link.count()).resolves.toBe(0);
    await expect(
      prisma.highlight.findUnique({ where: { id: highlight.id } }),
    ).resolves.toMatchObject({
      promotedSectionId: null,
    });
    await expect(prisma.inboxItem.findUnique({ where: { id: item.id } })).resolves.toMatchObject({
      placedInSectionId: null,
    });
    await expect(prisma.section.findUnique({ where: { id: copy.id } })).resolves.toMatchObject({
      conflictOf: null,
      conflictDevice: null,
      sourceAt: null,
      sourcePage: null,
    });
  });
});

describe('the M10 templates migration', () => {
  it('gives every lesson the kind that was its source', async () => {
    const { id: userId } = await newUser();
    const lesson = await prisma.lesson.create({
      data: { userId, title: 'Psalm 23', date: new Date('2026-10-04'), source: 'group' },
    });
    const sql = readFileSync(
      'prisma/migrations/20261018180000_templates_lesson_kind/migration.sql',
      'utf8',
    );
    const backfill = /^UPDATE "lesson" SET "kind" = "source"(?=;)/m.exec(sql);
    expect(backfill).not.toBeNull();
    await prisma.$executeRawUnsafe(`${backfill![0]} WHERE "id" = '${lesson.id}'::uuid`);
    await expect(prisma.lesson.findUnique({ where: { id: lesson.id } })).resolves.toMatchObject({
      kind: 'group',
    });
  });
});

/** The statements of the M10 migration that give every question its thread (§17.5). */
function threadBackfill(): string[] {
  const sql = readFileSync(
    'prisma/migrations/20261018140000_question_entry_link/migration.sql',
    'utf8',
  );
  const from = sql.indexOf('-- Every question gets its thread');
  return sql
    .slice(from)
    .split(/;\s*\n/)
    .map((statement) => statement.replaceAll(/^--.*$/gm, '').trim())
    .filter(Boolean);
}

const at = (minute: number) => new Date(Date.UTC(2026, 2, 1, 9, minute));

describe('the M10 migration', () => {
  it('gives every question a thread that matches its old status, at a new rev each', async () => {
    const user = await newUser();
    const userId = user.id;
    await prisma.user.update({ where: { id: userId }, data: { syncRev: 10n } });
    const lesson = await newLesson(userId);
    const answer = await prisma.section.create({
      data: { userId, lessonId: lesson.id, orderKey: 'a1', body: {}, createdAt: at(5) },
    });
    const ask = (text: string, extra: object = {}) =>
      prisma.question.create({
        data: { userId, lessonId: lesson.id, text, createdAt: at(1), updatedAt: at(9), ...extra },
      });
    const open = await ask('open');
    const answered = await ask('answered', { status: 'answered', answerSectionId: answer.id });
    // Answered in a section with nothing written yet: open, as before, until it has an answer.
    const waiting = await ask('waiting', { answerSectionId: answer.id });
    const parked = await ask('parked', { status: 'parked' });
    const parkedAfter = await ask('parked after an answer', {
      status: 'parked',
      answerSectionId: answer.id,
    });
    const deleted = await ask('deleted', { deletedAt: at(9) });
    const other = await newUser('other@example.com');
    const theirs = await prisma.question.create({
      data: { userId: other.id, lessonId: (await newLesson(other.id)).id, text: 'theirs' },
    });

    for (const statement of threadBackfill()) await prisma.$executeRawUnsafe(statement);

    const entries = await prisma.questionEntry.findMany({ orderBy: { rev: 'asc' } });
    const thread = (questionId: string) =>
      entries
        .filter((e) => e.questionId === questionId)
        .map((e) => [e.kind, e.sectionId, e.createdAt.toISOString().slice(11, 16)]);
    expect(thread(open.id)).toEqual([['asked', null, '09:01']]);
    expect(thread(answered.id)).toEqual([
      ['asked', null, '09:01'],
      ['answered', answer.id, '09:05'],
    ]);
    expect(thread(waiting.id)).toEqual(thread(answered.id).map((e) => [...e]));
    expect(thread(parked.id)).toEqual([
      ['asked', null, '09:01'],
      ['parked', null, '09:09'],
    ]);
    expect(thread(parkedAfter.id)).toEqual([
      ['asked', null, '09:01'],
      ['answered', answer.id, '09:05'],
      ['parked', null, '09:09'],
    ]);
    expect(thread(deleted.id)).toEqual([['asked', null, '09:01']]);
    expect(thread(theirs.id)).toEqual([['asked', null, expect.any(String)]]);
    for (const entry of entries) {
      expect(entry).toMatchObject({ lessonId: expect.any(String), deletedAt: null });
      expect(entry.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    }

    // Each of mine took the next rev after the user's, in the order they happened.
    const mine = entries.filter((e) => e.userId === userId);
    expect(mine.map((e) => Number(e.rev))).toEqual(mine.map((_, i) => 11 + i));
    const order = mine.map((e) => e.createdAt.getTime());
    expect(order).toEqual(order.toSorted((a, b) => a - b));
    await expect(prisma.user.findUnique({ where: { id: userId } })).resolves.toMatchObject({
      syncRev: BigInt(10 + mine.length),
    });
    await expect(prisma.user.findUnique({ where: { id: other.id } })).resolves.toMatchObject({
      syncRev: 1n,
    });
  });
});
