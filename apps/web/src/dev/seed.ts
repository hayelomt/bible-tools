import {
  type Block,
  DEFAULT_TRANSLATION,
  keysBetween,
  type Lesson,
  parseReference,
  type SectionBody,
  type Series,
  type VerseRef,
} from '@lamp/domain';
import { action } from '@/data/action.ts';
import { createLesson } from '@/data/actions/lessons.ts';
import { addQuestion, answerBody, promoteQuestion, setParked } from '@/data/actions/questions.ts';
import { createSection, updateSection } from '@/data/actions/sections.ts';
import { createSeries } from '@/data/actions/series.ts';
import { addTag } from '@/data/actions/tags.ts';
import { createTakeaway } from '@/data/actions/takeaways.ts';
import { type LampDb, SETTINGS_KEY } from '@/data/db.ts';
import { ensureDevice } from '@/data/setup.ts';
import { today } from '@/lib/dates.ts';

/*
 * Dev data for trying the app by hand (`/dev/seed`, dev builds only). Everything is written
 * through the app's own actions, so citations, the outbox and the search index update as they do
 * in use. Dates count back from today, so the lessons read as the last five weeks.
 */

/** A note: `{Rom 8:28}` is a verse chip, a line starting `- ` a bullet, `\n` a new paragraph. */
interface NotePlan {
  text: string;
  tags?: string[];
  replies?: NotePlan[];
}

interface QuestionPlan {
  text: string;
  status: 'open' | 'parked' | 'answered';
  /** For `answered`: what's written under the question in its answer section. */
  answer?: string;
}

interface LessonPlan {
  title: string;
  daysAgo: number;
  source: Lesson['source'];
  speaker?: string;
  church?: string;
  series?: string;
  main?: string[];
  tags?: string[];
  notes: NotePlan[];
  takeaways?: string[];
  questions?: QuestionPlan[];
}

const SERIES: { key: string; title: string; description: string; kind: Series['kind'] }[] = [
  {
    key: 'romans',
    title: 'Romans: Life in the Spirit',
    description: 'Sunday mornings through Romans 5–8.',
    kind: 'sermon_series',
  },
  {
    key: 'ascents',
    title: 'Psalms of Ascent',
    description: 'Wednesday group, one psalm a week.',
    kind: 'book_study',
  },
];

const CHURCH = 'Grace Community Church';

const LESSONS: LessonPlan[] = [
  {
    title: 'Peace with God',
    daysAgo: 35,
    source: 'sermon',
    speaker: 'Pastor James Okafor',
    church: CHURCH,
    series: 'romans',
    main: ['Rom 5:1-11'],
    tags: ['grace'],
    notes: [
      {
        text: 'Justified by faith, we have peace with God {Rom 5:1}. Peace is a status before it is a feeling.',
        tags: ['faith'],
        replies: [{ text: 'Compare the peace that guards the heart {Phil 4:7}.' }],
      },
      {
        text: 'Suffering produces endurance, endurance character, character hope {Rom 5:3-5}.',
        tags: ['suffering', 'hope'],
      },
      {
        text: 'While we were still sinners, Christ died for us {Rom 5:8}.\nNot after we cleaned up. While.',
        tags: ['love'],
      },
    ],
    takeaways: ['Peace with God comes before the peace of God.'],
    questions: [
      {
        text: 'How does suffering produce hope rather than despair?',
        status: 'answered',
        answer:
          'Because the love of God has been poured into our hearts {Rom 5:5}; hope rests on that, not on circumstances.',
      },
    ],
  },
  {
    title: 'Song of the pilgrim',
    daysAgo: 32,
    source: 'group',
    series: 'ascents',
    main: ['Ps 121'],
    notes: [
      {
        text: 'I lift up my eyes to the hills. Where does my help come from? {Ps 121:1-2}',
        tags: ['prayer'],
      },
      {
        text: '- He will not let your foot slip\n- He who keeps you will not slumber\n- The Lord is your shade',
      },
      { text: 'Sam shared about the move; pray for the family this week.', tags: ['family'] },
    ],
    takeaways: ['My help comes from the Lord, not the hills.'],
    questions: [{ text: 'Were the hills a comfort or a threat to the pilgrims?', status: 'open' }],
  },
  {
    title: 'Dead to sin, alive to God',
    daysAgo: 28,
    source: 'sermon',
    speaker: 'Pastor James Okafor',
    church: CHURCH,
    series: 'romans',
    main: ['Rom 6:1-14'],
    notes: [
      {
        text: 'Shall we go on sinning so that grace may increase? By no means! {Rom 6:1-2}',
        tags: ['grace', 'holiness'],
      },
      {
        text: 'Baptism pictures burial and resurrection {Rom 6:4}.',
        tags: ['resurrection'],
        replies: [
          { text: 'Buried with him in baptism, raised through faith {Col 2:12}.' },
          { text: 'Ask about infant baptism at small group.' },
        ],
      },
      { text: 'Count yourselves dead to sin {Rom 6:11}: a reckoning, not a feeling.' },
    ],
    takeaways: ['Grace is not permission; it is power.', 'Reckon it true before it feels true.'],
    questions: [
      { text: 'What does “count yourselves dead” look like on a Monday?', status: 'open' },
      { text: 'Is Romans 6 about baptism in water or in the Spirit?', status: 'parked' },
    ],
  },
  {
    title: 'Unless the Lord builds the house',
    daysAgo: 25,
    source: 'group',
    series: 'ascents',
    main: ['Ps 127'],
    notes: [
      {
        text: 'Unless the Lord builds the house, the builders labour in vain {Ps 127:1}.',
        tags: ['stewardship', 'rest'],
      },
      {
        text: 'He gives to his beloved sleep {Ps 127:2}. Rest as an act of trust.',
        tags: ['rest'],
      },
    ],
    takeaways: ['Overwork can be unbelief.'],
  },
  {
    title: 'The wretched man',
    daysAgo: 21,
    source: 'sermon',
    speaker: 'Rev. Anna Lindqvist',
    church: CHURCH,
    series: 'romans',
    main: ['Rom 7:7-25'],
    notes: [
      {
        text: 'The good I want to do, I do not do {Rom 7:19}.',
        tags: ['repentance'],
      },
      {
        text: 'Who will deliver me from this body of death? Thanks be to God {Rom 7:24-8:2}. The cry and the answer run straight into chapter 8.',
        tags: ['salvation', 'assurance'],
      },
    ],
    takeaways: ['The struggle is a sign of life, not of loss.'],
    questions: [
      { text: 'Is Paul describing himself before or after conversion?', status: 'parked' },
    ],
  },
  {
    title: 'Quiet time: forgiveness',
    daysAgo: 17,
    source: 'personal',
    main: ['Matt 18:21-35'],
    tags: ['forgiveness'],
    notes: [
      {
        text: 'Seventy times seven {Matt 18:22}: forgiveness keeps no ledger.',
        tags: ['forgiveness'],
      },
      {
        text: 'The servant forgiven ten thousand talents chokes a man over a hundred denarii {Matt 18:28}.',
      },
      { text: 'Forgive as the Lord forgave you {Col 3:13}.' },
    ],
    takeaways: ['I have been forgiven more than I will ever forgive.'],
    questions: [{ text: 'Who am I still keeping score with?', status: 'open' }],
  },
  {
    title: 'No condemnation',
    daysAgo: 14,
    source: 'sermon',
    speaker: 'Pastor James Okafor',
    church: CHURCH,
    series: 'romans',
    main: ['Rom 8:1-17'],
    tags: ['Holy Spirit'],
    notes: [
      {
        text: 'There is therefore now no condemnation {Rom 8:1}.',
        tags: ['assurance', 'grace'],
      },
      {
        text: 'The Spirit himself bears witness with our spirit that we are children of God {Rom 8:16}.',
        tags: ['Holy Spirit', 'identity'],
        replies: [{ text: 'Adoption, not just pardon {Gal 4:5-7}.', tags: ['adoption'] }],
      },
      {
        text: 'Abba, Father {Rom 8:15}: the language of a child, not a servant.',
        tags: ['adoption'],
      },
    ],
    takeaways: ['I am a son, not a slave.'],
    questions: [
      {
        text: 'What is the difference between adoption and justification?',
        status: 'answered',
        answer:
          'Justification is the judge’s verdict; adoption is the father’s welcome {Rom 8:15}.',
      },
    ],
  },
  {
    title: 'Those who trust in the Lord',
    daysAgo: 11,
    source: 'group',
    series: 'ascents',
    main: ['Ps 125'],
    notes: [
      {
        text: 'Those who trust in the Lord are like Mount Zion, which cannot be moved {Ps 125:1}.',
        tags: ['faith'],
      },
      { text: 'As the mountains surround Jerusalem, so the Lord surrounds his people {Ps 125:2}.' },
    ],
  },
  {
    title: 'More than conquerors',
    daysAgo: 7,
    source: 'sermon',
    speaker: 'Pastor James Okafor',
    church: CHURCH,
    series: 'romans',
    main: ['Rom 8:18-39'],
    tags: ['hope'],
    notes: [
      {
        text: 'The sufferings of this present time are not worth comparing with the glory {Rom 8:18}.',
        tags: ['suffering', 'hope'],
      },
      {
        text: 'We know that all things work together for good {Rom 8:28}. All things: not each thing on its own.',
        tags: ['promises'],
        replies: [{ text: 'Joseph: you meant evil, God meant it for good {Gen 50:20}.' }],
      },
      {
        text: 'Nothing can separate us from the love of God {Rom 8:38-39}.',
        tags: ['love', 'assurance'],
      },
      { text: 'He who keeps you will not slumber {Ps 121:3} came to mind again.' },
    ],
    takeaways: ['Nothing in all creation can separate me from his love.'],
    questions: [
      {
        text: 'How do I say Romans 8:28 to someone grieving without it sounding cheap?',
        status: 'open',
      },
    ],
  },
  {
    title: 'Kept from stumbling',
    daysAgo: 3,
    source: 'personal',
    main: ['Jude'],
    notes: [
      {
        text: 'Now to him who is able to keep you from stumbling {Jude 24-25}.',
        tags: ['worship', 'assurance'],
      },
      { text: 'Contend for the faith {Jude 3}, but keep yourselves in the love of God {Jude 21}.' },
    ],
    takeaways: ['He keeps me; I keep myself in his love.'],
  },
];

const dateDaysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return today(date);
};

function verseRef(reference: string): VerseRef {
  const parsed = parseReference(reference);
  if (!parsed.ok) throw new Error(`Seed reference doesn't parse: ${reference}`);
  return { ...parsed.ref, translation: DEFAULT_TRANSLATION };
}

/** One line of a note, its `{chips}` as verse nodes. */
function inline(line: string) {
  return line
    .split(/(\{[^}]+\})/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('{')
        ? { type: 'verse' as const, attrs: verseRef(part.slice(1, -1)) }
        : { type: 'text' as const, text: part },
    );
}

/** A note's text as a section body: a paragraph per line, `- ` lines as one bullet list. */
export function noteBody(text: string): SectionBody {
  const lines = text.split('\n');
  const bullets = lines.filter((line) => line.startsWith('- '));
  const content: Block[] = lines
    .filter((line) => !line.startsWith('- '))
    .map((line) => ({ type: 'paragraph', content: inline(line) }));
  if (bullets.length > 0) {
    content.push({
      type: 'bulletList',
      content: bullets.map((line) => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: inline(line.slice(2)) }],
      })),
    });
  }
  return { type: 'doc', content };
}

/** Notes (and their replies) under `parentId`, in order. */
async function writeNotes(
  db: LampDb,
  lessonId: string,
  notes: NotePlan[],
  parentId: string | null = null,
) {
  const keys = keysBetween(null, null, notes.length);
  for (const [i, note] of notes.entries()) {
    const section = await createSection(
      {
        lessonId,
        parentId,
        orderKey: keys[i]!,
        body: noteBody(note.text),
        conflictOf: null,
        conflictDevice: null,
      },
      db,
    );
    for (const tag of note.tags ?? []) await addTag({ kind: 'section', id: section.id }, tag, db);
    if (note.replies) await writeNotes(db, lessonId, note.replies, section.id);
  }
}

async function writeQuestion(db: LampDb, lessonId: string, plan: QuestionPlan) {
  const question = await addQuestion(lessonId, plan.text, db);
  if (plan.status === 'parked') await setParked(question.id, true, db);
  if (plan.status === 'answered') {
    const section = await promoteQuestion(question.id, undefined, db);
    const body = answerBody(plan.text);
    body.content = [body.content[0]!, ...noteBody(plan.answer ?? 'Answered.').content];
    await updateSection(section.id, { body }, db);
  }
}

/** The demo month: two series, ten lessons, notes with replies, tags, takeaways and questions. */
export async function seedDemo(db: LampDb): Promise<void> {
  const series = new Map<string, string>();
  for (const { key, ...fields } of SERIES) {
    series.set(key, (await createSeries(fields, db)).id);
  }
  for (const plan of LESSONS) {
    const lesson = await createLesson(
      {
        seriesId: plan.series ? series.get(plan.series)! : null,
        title: plan.title,
        date: dateDaysAgo(plan.daysAgo),
        source: plan.source,
        speaker: plan.speaker ?? null,
        church: plan.church ?? null,
        mainPassages: (plan.main ?? []).map(verseRef),
      },
      db,
    );
    for (const tag of plan.tags ?? []) await addTag({ kind: 'lesson', id: lesson.id }, tag, db);
    await writeNotes(db, lesson.id, plan.notes);
    for (const text of plan.takeaways ?? []) {
      await createTakeaway({ lessonId: lesson.id, text }, db);
    }
    for (const question of plan.questions ?? []) await writeQuestion(db, lesson.id, question);
  }
}

const WORDS =
  'grace faith hope love shepherd sheep door vine branch abide light world truth life way spirit word flesh glory father son servant king kingdom heaven earth bread water wine wedding feast lamb blood cross tomb rise risen sin forgive mercy peace joy fruit seed sower field harvest prayer fast temple law prophet promise covenant'.split(
    ' ',
  );
const words = (n: number, salt: number) =>
  Array.from({ length: n }, (_, i) => WORDS[(i * 7 + salt * 13) % WORDS.length]).join(' ');
const BULK_REFS = ['John 3:16', 'Rom 8:28', 'Ps 23', 'Isa 53:5', 'Matt 5:3-12', 'Eph 2:8-9'];

/**
 * 50 lessons of 100 sections, about 40 words each, in a "Bulk" series: the M4-05 speed check's
 * size, for trying search and long lists. One action per lesson, so it takes a few seconds.
 */
export async function seedBulk(db: LampDb, lessons = 50, sections = 100): Promise<void> {
  const seriesId = (
    await createSeries(
      { title: 'Bulk: 5,000 sections', description: 'Generated by /dev/seed.', kind: 'custom' },
      db,
    )
  ).id;
  for (let l = 0; l < lessons; l++) {
    await action(db, async (w) => {
      const lesson = await w.create('lesson', {
        seriesId,
        title: `Bulk lesson ${l + 1}`,
        date: dateDaysAgo(60 + l),
        source: 'sermon',
        speaker: null,
        church: null,
        mainPassages: [],
      });
      const keys = keysBetween(null, null, sections);
      for (let s = 0; s < sections; s++) {
        const chip = s % 10 === 0 ? ` {${BULK_REFS[(l + s) % BULK_REFS.length]}}` : '';
        await w.create('section', {
          lessonId: lesson.id,
          parentId: null,
          orderKey: keys[s]!,
          body: noteBody(
            `${words(20 + (s % 7), l * sections + s)}${chip}\n${words(20, s)} note ${l + 1}-${s + 1}`,
          ),
          conflictOf: null,
          conflictDevice: null,
        });
      }
    });
  }
}

/**
 * Empties this device's database: notes, the outbox and the sync state. The settings are kept,
 * and the device is set up again with its 24 seeded tags, as on a first run.
 */
export async function clearDevice(db: LampDb): Promise<void> {
  const settings = await db.userSettings.get(SETTINGS_KEY);
  await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((table) => table.clear())));
  await ensureDevice(db, { colorMode: settings?.colorMode ?? 'system' });
  if (settings) await db.userSettings.put(settings, SETTINGS_KEY);
}
