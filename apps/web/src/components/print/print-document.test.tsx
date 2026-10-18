import type { Lesson, Section, SectionBody, Series, Takeaway, VerseRef } from '@lamp/domain';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { QuestionView } from '@/data/question-status.ts';
import type { LessonForExport } from '@/export/markdown.ts';
import { Credit, LessonDocument, SeriesDocument } from './print-document.tsx';

afterEach(cleanup);

const JOHN_10_9: VerseRef = {
  book: 'JHN',
  chapter: 10,
  verseStart: 9,
  display: 'John 10:9',
  translation: 'BSB',
  snapshotText: 'I am the door. If anyone enters in by me, he will be saved.',
};

const doc = (...content: SectionBody['content']): SectionBody => ({ type: 'doc', content });

const section = (id: string, parentId: string | null, orderKey: string, body: SectionBody) =>
  ({ id, lessonId: 'l1', parentId, orderKey, body }) as Section;

const question = (id: string, text: string, status: QuestionView['status']) =>
  ({ id, lessonId: 'l1', text, status }) as QuestionView;

function goodShepherd(overrides: Partial<Lesson> = {}): LessonForExport {
  return {
    lesson: {
      id: 'l1',
      title: 'The Good Shepherd',
      date: '2026-10-12',
      kind: 'sermon',
      speaker: 'Pastor Ann',
      church: 'Grace Chapel',
      mainPassages: [{ ...JOHN_10_9, verseStart: 1, verseEnd: 18, display: 'John 10:1–18' }],
      ...overrides,
    } as Lesson,
    sections: [
      // Stored out of order: the document follows the outline.
      section(
        'reply',
        'door',
        'a0',
        doc({
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'He leads' }] }],
            },
          ],
        }),
      ),
      section(
        'door',
        null,
        'a0',
        doc({
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Jesus is the door ' },
            { type: 'verse', attrs: JOHN_10_9 },
            { type: 'text', text: ': ' },
            { type: 'text', text: 'salvation', marks: [{ type: 'bold' }] },
          ],
        }),
      ),
      section(
        'sheep',
        null,
        'a1',
        doc(
          {
            type: 'heading',
            attrs: { level: 3 },
            content: [{ type: 'text', text: 'Other sheep' }],
          },
          { type: 'paragraph' },
        ),
      ),
    ],
    sectionTags: new Map([['door', ['hope', 'Holy Spirit']]]),
    tags: ['grace'],
    takeaways: [{ id: 't1', text: 'He knows his sheep by name.' } as Takeaway],
    questions: [
      question('q1', 'Who are the other sheep?', 'answered'),
      question('q2', 'What is the door?', 'open'),
      question('q3', 'Thief vs hired hand?', 'parked'),
    ],
  };
}

describe('LessonDocument', () => {
  it('prints the header, the sections in order with verse text quoted, then takeaways and questions', () => {
    const { container } = render(<LessonDocument data={goodShepherd()} />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('The Good Shepherd');
    expect(container.textContent).toContain(
      'Monday 12 October 2026 · Sermon · Pastor Ann, Grace ChapelJohn 10:1–18 · #grace',
    );

    const [door, reply, sheep] = container.querySelectorAll('section');
    expect(door!.querySelector('p')!.textContent).toBe(
      'Jesus is the door John 10:9 (BSB): salvation',
    );
    expect(door!.querySelector('strong')?.textContent).toBe('salvation');
    expect(door!.querySelector('blockquote')!.textContent).toBe(
      'John 10:9 (BSB) I am the door. If anyone enters in by me, he will be saved.',
    );
    expect(door!.textContent).toContain('#hope · #Holy Spirit');
    // A reply is indented under its section; its list keeps its bullets.
    expect(reply!.className).toContain('border-l-2');
    expect(within(reply!).getByRole('listitem').textContent).toBe('He leads');
    // A section's heading sits under the lesson's title; an empty paragraph prints nothing.
    expect(within(sheep!).getByRole('heading', { level: 2 }).textContent).toBe('Other sheep');
    expect(sheep!.querySelectorAll('p')).toHaveLength(0);

    expect(screen.getByRole('heading', { name: 'Takeaways', level: 2 })).toBeDefined();
    const questions = screen.getByRole('heading', { name: 'Questions' }).nextElementSibling!;
    expect([...questions.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      '☑Answered: Who are the other sheep?',
      '☐Open: What is the door?',
      '☐Open: Thief vs hired hand? (parked)',
    ]);
  });

  it('leaves out what the lesson doesn’t have', () => {
    const data = goodShepherd({ speaker: null, church: null, mainPassages: [] });
    render(
      <LessonDocument data={{ ...data, sections: [], tags: [], takeaways: [], questions: [] }} />,
    );
    expect(screen.getByRole('article').textContent).toBe(
      'The Good ShepherdMonday 12 October 2026 · Sermon',
    );
  });
});

describe('SeriesDocument', () => {
  it('lists the lessons on a title page, then each lesson on a page of its own', () => {
    const series = {
      id: 's1',
      title: 'John',
      kind: 'sermon_series',
      description: 'Sunday mornings.',
    } as Series;
    const second = goodShepherd({ id: 'l2', title: 'The Vine', date: '2026-10-19' });
    const { container } = render(
      <SeriesDocument data={{ series, lessons: [goodShepherd(), second] }} />,
    );

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('John');
    expect(container.textContent).toContain('Sermon series · 2 lessons');
    expect([...container.querySelectorAll('ol > li')].map((li) => li.textContent)).toEqual([
      'Mon 12 Oct 2026The Good Shepherd',
      'Mon 19 Oct 2026The Vine',
    ]);
    const titles = screen.getAllByRole('heading', { level: 2 });
    expect(titles.map((h) => h.textContent)).toEqual(['The Good Shepherd', 'The Vine']);
    for (const title of titles) {
      expect(title.closest('article')!.parentElement!.className).toContain('break-before-page');
    }
    // Inside a series, a lesson's own headings are one level down.
    expect(screen.getAllByRole('heading', { name: 'Takeaways', level: 3 })).toHaveLength(2);
    expect(container.querySelectorAll('footer')).toHaveLength(1);
  });
});

describe('Credit', () => {
  it('names the translations quoted, and is left out when none is', () => {
    const { container, rerender } = render(<Credit lessons={[goodShepherd()]} />);
    expect(container.textContent).toBe('Scripture: Berean Standard Bible (public domain).');
    const data = goodShepherd({ mainPassages: [] });
    rerender(<Credit lessons={[{ ...data, sections: [] }]} />);
    expect(container.textContent).toBe('');
  });
});
