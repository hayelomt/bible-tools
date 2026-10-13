import { execFileSync } from 'node:child_process';
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
    await prisma.$transaction([
      prisma.session.create({ data: { userId, tokenHash: 'h1', expiresAt: new Date() } }),
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
      prisma.highlight.count({ where }),
      prisma.memoryItem.count({ where }),
      prisma.citation.count({ where }),
      prisma.syncChange.count({ where }),
      prisma.device.count({ where }),
    ]);
    expect(counts.every((n) => n === 0)).toBe(true);
    await expect(prisma.lesson.count({ where: { userId: other.id } })).resolves.toBe(1);
  });

  it('of a lesson remove its sections, links, takeaways, questions and citations', async () => {
    const { id: userId } = await newUser();
    const lesson = await newLesson(userId);
    const parent = await newSection(userId, lesson.id);
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
    await expect(prisma.question.count()).resolves.toBe(0);
    await expect(prisma.citation.count()).resolves.toBe(0);
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

  it('of a section unlink the questions, highlights and conflicted copies that point at it', async () => {
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
    const highlight = await prisma.highlight.create({
      data: { userId, ref: {}, colour: 'green', promotedSectionId: section.id },
    });

    await prisma.section.delete({ where: { id: section.id } });

    await expect(prisma.question.findUnique({ where: { id: question.id } })).resolves.toMatchObject(
      {
        answerSectionId: null,
      },
    );
    await expect(
      prisma.highlight.findUnique({ where: { id: highlight.id } }),
    ).resolves.toMatchObject({
      promotedSectionId: null,
    });
    await expect(prisma.section.findUnique({ where: { id: copy.id } })).resolves.toMatchObject({
      conflictOf: null,
      conflictDevice: null,
    });
  });
});
