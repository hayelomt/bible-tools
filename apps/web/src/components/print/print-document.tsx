import type { Question } from '@lamp/domain';
import { Button, buttonVariants } from '@lamp/ui/components/button';
import { Link, type LinkProps } from '@tanstack/react-router';
import { ArrowLeft, Printer } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { outline } from '@/components/sections/outline.ts';
import type { SeriesForExport } from '@/export/load.ts';
import { headerLines, type LessonForExport, scriptureCredit, tagLabel } from '@/export/markdown.ts';
import { shortDateWithYear } from '@/lib/dates.ts';
import { count, SERIES_KIND_LABELS } from '@/lib/labels.ts';
import { PrintBody } from './print-body.tsx';
import './print.css';

/**
 * The print view (F11, TECH-DESIGN §8.7, wireframes/export.md "Print view"): a lesson or a series
 * as a document, dark on white whatever the theme, so the page on screen is the page printed
 * (decided 2026-10-14). The browser's print dialog makes the PDF ("Save as PDF").
 */

interface PrintPageProps {
  /** Where Back goes: the lesson or series. */
  back: LinkProps;
  /** The document's title while it's shown: browsers name the PDF after it. */
  title: string;
  /** Opens the print dialog once, as the page shows (from Export); then `onPrinted`. */
  printNow: boolean;
  onPrinted: () => void;
  children: ReactNode;
}

/** Back and Print over a white page; only the page prints. */
export function PrintPage({ back, title, printNow, onPrinted, children }: PrintPageProps) {
  useDocumentTitle(title);
  const asked = useRef(false);
  useEffect(() => {
    if (!printNow || asked.current) return;
    asked.current = true;
    onPrinted();
    // After the fonts, so the dialog's preview has the reading face.
    void document.fonts.ready.then(() => window.print());
  }, [printNow, onPrinted]);

  return (
    <div className="min-h-dvh print:min-h-0">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background px-4 py-2 print:hidden">
        <Link {...back} className={buttonVariants({ variant: 'ghost' })}>
          <ArrowLeft aria-hidden />
          Back
        </Link>
        <Button onClick={() => window.print()}>
          <Printer aria-hidden />
          Print
        </Button>
      </div>
      <main className="mx-auto max-w-[46rem] bg-white px-5 py-8 font-serif text-neutral-900 sm:my-6 sm:px-12 sm:py-12 sm:shadow-md print:m-0 print:max-w-none print:p-0 print:shadow-none">
        {children}
      </main>
    </div>
  );
}

function useDocumentTitle(title: string) {
  useEffect(() => {
    const before = document.title;
    document.title = title;
    return () => {
      document.title = before;
    };
  }, [title]);
}

/** One lesson; `level` is its title's heading level (2 inside a series). */
export function LessonDocument({ data, level = 1 }: { data: LessonForExport; level?: 1 | 2 }) {
  const Title = level === 1 ? 'h1' : 'h2';
  const Sub = level === 1 ? 'h2' : 'h3';
  const headingLevel = level === 1 ? 2 : 3;
  const rows = outline(data.sections);

  return (
    <article className="flex flex-col gap-4 leading-relaxed">
      <header className="mb-2 flex flex-col gap-1">
        <Title
          className={`${level === 1 ? 'text-3xl' : 'text-2xl'} leading-tight font-semibold break-words`}
        >
          {data.lesson.title}
        </Title>
        {headerLines(data).map((line) => (
          <p key={line} className="font-sans text-sm text-neutral-600">
            {line}
          </p>
        ))}
      </header>

      {rows.map((row) => {
        const tags = data.sectionTags.get(row.item.id) ?? [];
        return (
          <section
            key={row.item.id}
            className={
              row.level === 0
                ? 'flex flex-col gap-3'
                : 'ml-4 flex flex-col gap-3 border-l-2 border-neutral-300 pl-4 sm:ml-6'
            }
          >
            <PrintBody body={row.item.body} headingLevel={headingLevel} />
            {tags.length > 0 && (
              <p className="font-sans text-sm text-neutral-600 italic">
                {tags.map(tagLabel).join(' · ')}
              </p>
            )}
          </section>
        );
      })}

      {data.takeaways.length > 0 && (
        <section className="mt-2 flex flex-col gap-2 break-inside-avoid">
          <Sub className="text-lg font-semibold">Takeaways</Sub>
          <ul className="list-disc pl-6">
            {data.takeaways.map((t) => (
              <li key={t.id} className="pl-1 break-words">
                {t.text}
              </li>
            ))}
          </ul>
        </section>
      )}
      {data.questions.length > 0 && (
        <section className="mt-2 flex flex-col gap-2 break-inside-avoid">
          <Sub className="text-lg font-semibold">Questions</Sub>
          <ul className="flex flex-col gap-1">
            {data.questions.map((q) => (
              <QuestionLine key={q.id} question={q} />
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

/** "☑ Who are the other sheep?" when answered; "☐" when open, or parked and marked so. */
function QuestionLine({ question }: { question: Question }) {
  const answered = question.status === 'answered';
  return (
    <li className="flex gap-2 break-words">
      <span aria-hidden className="font-sans">
        {answered ? '☑' : '☐'}
      </span>
      <span className="min-w-0">
        <span className="sr-only">{answered ? 'Answered: ' : 'Open: '}</span>
        {question.text}
        {question.status === 'parked' && <em className="text-neutral-600"> (parked)</em>}
      </span>
    </li>
  );
}

/** A series: a title page listing its lessons, then each lesson on a page of its own. */
export function SeriesDocument({ data: { series, lessons } }: { data: SeriesForExport }) {
  return (
    <>
      <header className="flex flex-col gap-3 leading-relaxed">
        <h1 className="text-3xl leading-tight font-semibold break-words">{series.title}</h1>
        <p className="font-sans text-sm text-neutral-600">
          {SERIES_KIND_LABELS[series.kind]} · {count(lessons.length, 'lesson')}
        </p>
        {series.description.trim() && (
          <p className="break-words whitespace-pre-line">{series.description.trim()}</p>
        )}
        {lessons.length > 0 && (
          <ol className="mt-4 flex flex-col gap-1">
            {lessons.map(({ lesson }) => (
              <li key={lesson.id} className="flex gap-4">
                <span className="w-32 shrink-0 font-sans text-sm leading-relaxed text-neutral-600">
                  {shortDateWithYear(lesson.date)}
                </span>
                <span className="min-w-0 break-words">{lesson.title}</span>
              </li>
            ))}
          </ol>
        )}
      </header>
      {lessons.map((lesson) => (
        <div
          key={lesson.lesson.id}
          className="mt-12 border-t border-neutral-300 pt-12 break-before-page print:mt-0 print:border-0 print:pt-0"
        >
          <LessonDocument data={lesson} level={2} />
        </div>
      ))}
      <Credit lessons={lessons} />
    </>
  );
}

/** "Scripture: World English Bible (public domain).", after a rule, when a verse is quoted. */
export function Credit({ lessons }: { lessons: LessonForExport[] }) {
  const credit = scriptureCredit(lessons);
  if (!credit) return null;
  return (
    <footer className="mt-8 border-t border-neutral-300 pt-3 font-sans text-sm text-neutral-600 break-inside-avoid">
      {credit}
    </footer>
  );
}
