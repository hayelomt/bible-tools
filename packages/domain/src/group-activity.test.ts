import { describe, expect, it } from 'vitest';
import { activityLine, groupActivity } from './group-activity.ts';

const ME = 'me';
const section = (id: string, userId: string, replyToId: string | null, addedRev: number) => ({
  id,
  userId,
  groupLessonId: 'lesson',
  replyToId,
  sharedAt: `2026-10-0${addedRev}T10:00:00.000Z`,
  createdAt: '2026-10-01T09:00:00.000Z',
  addedRev,
});

describe('groupActivity', () => {
  it('lists replies and comments to my sections, and others’ questions, latest first', () => {
    const items = groupActivity(ME, {
      sections: [
        section('mine', ME, null, 0),
        section('theirs', 'ben', null, 1),
        section('reply', 'ben', 'mine', 2),
        // A reply to someone else's section, and mine to theirs, aren't mine to hear about.
        section('aside', 'cara', 'theirs', 3),
        section('my-reply', ME, 'theirs', 0),
      ],
      comments: [
        {
          id: 'c1',
          userId: 'cara',
          sectionId: 'mine',
          createdAt: '2026-10-05T00:00:00Z',
          addedRev: 5,
        },
        {
          id: 'c2',
          userId: 'cara',
          sectionId: 'theirs',
          createdAt: '2026-10-05T00:00:00Z',
          addedRev: 6,
        },
        { id: 'c3', userId: ME, sectionId: 'mine', createdAt: '2026-10-05T00:00:00Z', addedRev: 0 },
      ],
      questions: [
        {
          id: 'q1',
          userId: 'ben',
          groupLessonId: 'lesson',
          text: 'Why a gate?',
          createdAt: '2026-10-04T00:00:00Z',
          addedRev: 4,
        },
        {
          id: 'q2',
          userId: ME,
          groupLessonId: 'lesson',
          text: 'Mine',
          createdAt: '2026-10-04T00:00:00Z',
          addedRev: 0,
        },
      ],
    });
    expect(items.map((i) => [i.kind, i.id, i.addedRev])).toEqual([
      ['comment', 'c1', 5],
      ['question', 'q1', 4],
      ['reply', 'reply', 2],
    ]);
    expect(items[0]).toMatchObject({ groupLessonId: 'lesson', userId: 'cara', text: null });
  });

  it('says what happened', () => {
    expect(activityLine({ kind: 'reply', text: null }, 'Ben')).toBe('Ben replied to your section');
    expect(activityLine({ kind: 'comment', text: null }, 'Ben')).toBe(
      'Ben commented on your section',
    );
    expect(activityLine({ kind: 'question', text: 'Why?' }, 'Cara')).toBe('Cara asked “Why?”');
  });
});
