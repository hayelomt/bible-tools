// Demo data for local development: `pnpm db:seed`. Replaces the demo user (and, by cascade,
// everything they own) on every run; other users are left alone.
import { existsSync } from 'node:fs';
import { SEED_TAGS } from '@lamp/domain';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { envFilePaths } from '../src/config/env.ts';
import { type Prisma, PrismaClient } from '../src/generated/prisma/client.ts';

const DEMO_EMAIL = 'demo@lamp.local';
const DEMO_PASSWORD = 'lamp-demo-password';

for (const path of envFilePaths()) {
  if (existsSync(path)) process.loadEnvFile(path);
}
if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to seed demo data with NODE_ENV=production');
}
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Run scripts/dev-db.sh first.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Verse ordinal (TECH-DESIGN §4.1): bookIndex·1,000,000 + chapter·1,000 + verse. Romans is
// book 45 and Philippians book 50. Inlined until the book table lands in domain (M1-08).
const ROM = 45;
const PHP = 50;
const ord = (book: number, chapter: number, verse: number): number =>
  book * 1_000_000 + chapter * 1_000 + verse;

// ProseMirror JSON for section bodies (shape checked by domain's bodySchema once M1-10 lands).
type Node = Prisma.InputJsonObject;
const verse = (attrs: Node): Node => ({
  type: 'verse',
  attrs: { translation: 'WEB', ...attrs },
});
const text = (value: string): Node => ({ type: 'text', text: value });
const doc = (...content: Node[]): Node => ({
  type: 'doc',
  content: [{ type: 'paragraph', content }],
});

async function main(): Promise<void> {
  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });

  let rev = 0n;
  const next = (): bigint => ++rev;

  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      passwordHash: await hash(DEMO_PASSWORD),
      emailVerifiedAt: new Date(),
      settings: { create: { rev: next() } },
    },
  });
  const userId = user.id;

  const tags = await prisma.tag.createManyAndReturn({
    data: SEED_TAGS.map((name) => ({ userId, name, isSeeded: true, rev: next() })),
  });
  const tag = (name: string) => {
    const found = tags.find((t) => t.name === name);
    if (!found) throw new Error(`No seeded tag "${name}"`);
    return found.id;
  };

  const series = await prisma.series.create({
    data: { userId, title: 'Romans: Life in the Spirit', kind: 'sermon_series', rev: next() },
  });

  const rom8 = {
    book: 'ROM',
    chapter: 8,
    verseStart: 28,
    verseEnd: 30,
    display: 'Romans 8:28–30',
    translation: 'WEB',
  };
  const lesson = await prisma.lesson.create({
    data: {
      userId,
      seriesId: series.id,
      title: 'All things work together',
      date: new Date('2026-10-04'),
      source: 'sermon',
      speaker: 'Pastor Sam',
      church: 'Grace Fellowship',
      mainPassages: [rom8],
      rev: next(),
    },
  });

  const opening = await prisma.section.create({
    data: {
      userId,
      lessonId: lesson.id,
      orderKey: 'a0',
      body: doc(
        text('God works all things for good for those who love him '),
        verse({ ...rom8, verseEnd: undefined, display: 'Romans 8:28' }),
        text('. "All things" includes the hard things.'),
      ),
      rev: next(),
    },
  });
  const reply = await prisma.section.create({
    data: {
      userId,
      lessonId: lesson.id,
      parentId: opening.id,
      orderKey: 'a0',
      body: doc(
        text('The chain in 8:29–30 runs from foreknown to glorified with no link missing.'),
      ),
      rev: next(),
    },
  });
  const compare = await prisma.section.create({
    data: {
      userId,
      lessonId: lesson.id,
      orderKey: 'a1',
      body: doc(
        text('Compare '),
        verse({ book: 'PHP', chapter: 1, verseStart: 6, display: 'Philippians 1:6' }),
        text(': he who began a good work will complete it.'),
      ),
      rev: next(),
    },
  });

  await prisma.sectionTag.createMany({
    data: [
      { userId, sectionId: opening.id, tagId: tag('suffering'), rev: next() },
      { userId, sectionId: opening.id, tagId: tag('hope'), rev: next() },
    ],
  });
  await prisma.lessonTag.create({
    data: { userId, lessonId: lesson.id, tagId: tag('grace'), rev: next() },
  });
  await prisma.takeaway.create({
    data: {
      userId,
      lessonId: lesson.id,
      text: 'Nothing I face is outside his purpose.',
      rev: next(),
    },
  });
  await prisma.question.create({
    data: {
      userId,
      lessonId: lesson.id,
      text: 'How does foreknowledge relate to predestination here?',
      answerSectionId: reply.id,
      status: 'answered',
      rev: next(),
    },
  });
  await prisma.question.create({
    data: {
      userId,
      lessonId: lesson.id,
      text: 'What does "conformed to the image" look like day to day?',
      rev: next(),
    },
  });

  const earlier = await prisma.lesson.create({
    data: {
      userId,
      seriesId: series.id,
      title: 'No condemnation',
      date: new Date('2026-09-27'),
      mainPassages: [
        {
          book: 'ROM',
          chapter: 8,
          verseStart: 1,
          verseEnd: 4,
          display: 'Romans 8:1–4',
          translation: 'WEB',
        },
      ],
      rev: next(),
    },
  });

  const highlight = await prisma.highlight.create({
    data: {
      userId,
      ref: {
        book: 'ROM',
        chapter: 8,
        verseStart: 38,
        chapterEnd: 9,
        verseEnd: 5,
        display: 'Romans 8:38–9:5',
        translation: 'WEB',
      },
      colour: 'yellow',
      note: 'Nothing can separate us.',
      rev: next(),
    },
  });
  const memory = await prisma.memoryItem.create({
    data: { userId, ref: { ...rom8, verseEnd: undefined, display: 'Romans 8:28' }, rev: next() },
  });

  await prisma.citation.createMany({
    data: [
      {
        userId,
        sourceType: 'lesson',
        sourceId: lesson.id,
        lessonId: lesson.id,
        book: 'ROM',
        startOrd: ord(ROM, 8, 28),
        endOrd: ord(ROM, 8, 30),
      },
      {
        userId,
        sourceType: 'lesson',
        sourceId: earlier.id,
        lessonId: earlier.id,
        book: 'ROM',
        startOrd: ord(ROM, 8, 1),
        endOrd: ord(ROM, 8, 4),
      },
      {
        userId,
        sourceType: 'section',
        sourceId: opening.id,
        lessonId: lesson.id,
        book: 'ROM',
        startOrd: ord(ROM, 8, 28),
        endOrd: ord(ROM, 8, 28),
      },
      {
        userId,
        sourceType: 'section',
        sourceId: compare.id,
        lessonId: lesson.id,
        book: 'PHP',
        startOrd: ord(PHP, 1, 6),
        endOrd: ord(PHP, 1, 6),
      },
      {
        userId,
        sourceType: 'highlight',
        sourceId: highlight.id,
        book: 'ROM',
        startOrd: ord(ROM, 8, 38),
        endOrd: ord(ROM, 9, 5),
      },
      {
        userId,
        sourceType: 'memory_item',
        sourceId: memory.id,
        book: 'ROM',
        startOrd: ord(ROM, 8, 28),
        endOrd: ord(ROM, 8, 28),
      },
    ],
  });

  await prisma.user.update({ where: { id: userId }, data: { syncRev: rev } });
  console.log(`Seeded ${DEMO_EMAIL} (password: ${DEMO_PASSWORD}) with 2 lessons.`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
