/** The content every look shows, so the directions compare like for like. */

export interface SampleLesson {
  title: string;
  date: string;
  weekday: string;
  passage: string;
  book: string;
  series?: string;
  sections: number;
}

export const LESSONS: readonly SampleLesson[] = [
  {
    title: 'The Good Shepherd',
    date: '11 Oct',
    weekday: 'Sun',
    passage: 'John 10:1–18',
    book: 'Jn',
    series: 'I Am',
    sections: 4,
  },
  {
    title: 'Bread of Life',
    date: '4 Oct',
    weekday: 'Sun',
    passage: 'John 6:35–51',
    book: 'Jn',
    series: 'I Am',
    sections: 3,
  },
  {
    title: 'Wrestling with God',
    date: '30 Sep',
    weekday: 'Wed',
    passage: 'Genesis 32:22–32',
    book: 'Gn',
    sections: 5,
  },
  {
    title: 'Light of the World',
    date: '27 Sep',
    weekday: 'Sun',
    passage: 'John 8:12–20',
    book: 'Jn',
    series: 'I Am',
    sections: 2,
  },
  {
    title: 'The Older Brother',
    date: '20 Sep',
    weekday: 'Sun',
    passage: 'Luke 15:11–32',
    book: 'Lk',
    series: 'Parables',
    sections: 6,
  },
];

export const SERIES = [
  { title: 'I Am', lessons: 7, of: 9, note: 'The seven sayings in John' },
  { title: 'Parables', lessons: 4, of: 12, note: 'Stories Jesus told' },
  { title: 'Psalms of Ascent', lessons: 3, of: 15, note: 'Psalms 120–134' },
] as const;

export const STATS = { lessons: 23, verses: 41, questions: 6, streak: 5 } as const;

/** Lessons per week, oldest first, for the small activity charts. */
export const ACTIVITY = [1, 2, 1, 0, 2, 3, 1, 2, 2, 4, 2, 3] as const;

/** John 10:11–14, World English Bible (public domain). */
export const PASSAGE = {
  reference: 'John 10:11–14',
  translation: 'WEB',
  verses: [
    { n: 11, text: 'I am the good shepherd. The good shepherd lays down his life for the sheep.' },
    {
      n: 12,
      text: 'He who is a hired hand, and not a shepherd, who doesn’t own the sheep, sees the wolf coming, leaves the sheep, and flees. The wolf snatches the sheep, and scatters them.',
    },
    {
      n: 13,
      text: 'The hired hand flees because he is a hired hand, and doesn’t care for the sheep.',
    },
    { n: 14, text: 'I am the good shepherd. I know my own, and I’m known by my own;' },
  ],
  highlight: 14,
} as const;

/** One section of the open lesson: a note citing a verse, a reply, a takeaway, a question. */
export const SECTION = {
  heading: 'He knows his own',
  before: 'Not a crowd he manages, but sheep he knows by name.',
  chip: 'John 10:14',
  after:
    'The hired hand runs because the sheep were never his. Being known comes before knowing: he speaks first, we learn the voice.',
  reply: 'Compare Psalm 23: the shepherd leads, restores, walks through the valley with us.',
  replyChip: 'Psalm 23:1',
  takeaway: 'Listen for his voice before the day’s noise starts.',
  question: 'Which other voices do I follow without noticing?',
  tags: ['shepherd', 'belonging', 'I Am'],
} as const;

export const NAV = ['Lessons', 'Read', 'Search', 'Review'] as const;
export type NavLabel = (typeof NAV)[number];
