import {
  citedRefs,
  formatPassage,
  type HandoutSnapshot,
  type Passage,
  type TranslationId,
  type VerseReader,
} from '@lamp/domain';
import type { CommentaryEntry, CommentaryView, LessonView, SeriesView } from '../views.js';
import { bodyHtml, type ChipHref } from './body.js';
import { type Html, markup } from './markup.js';
import { HANDOUT_SCRIPT } from './handout-script.js';
import { type Page, page } from './page.js';
import {
  count,
  creditFor,
  headerLines,
  lessonsCredit,
  longDate,
  momentLabel,
  SERIES_KIND_LABELS,
  shortDateWithYear,
  sourceOf,
  tagLabel,
} from './words.js';

/**
 * The shared pages (F34, wireframes/sharing.md "Shared page"): read-only, with no navigation
 * beyond what the link covers, no editing and no account prompt.
 */

const sharedFrom = (credit: string | null) =>
  markup`<p>Shared from Lamp.${credit ? ` ${credit}` : ''}</p>`;

/** Each section's anchor, for link chips to it and the compile view's pointers. */
export const sectionAnchor = (id: string) => `s-${id}`;

/** The lesson's document, as the print view lays it out. */
function lessonArticle(view: LessonView, href: ChipHref, verses: VerseReader): Html {
  const { lesson } = view;
  const source = sourceOf(lesson);
  return markup`<article class="doc">
    <header>
      <h1>${lesson.title}</h1>
      <div class="details">
        ${headerLines(lesson, view.tags).map((line) => markup`<p class="muted">${line}</p>`)}
        ${
          source &&
          markup`<p class="muted">
            ${source.words}${
              source.url &&
              markup` · <a href="${source.url}" rel="noopener noreferrer nofollow">${source.url}</a>`
            }
          </p>`
        }
      </div>
    </header>
    ${view.rows.map(({ section, level }) => {
      const tags = view.sectionTags.get(section.id) ?? [];
      const moment = momentLabel(section, lesson);
      return markup`<section
        id="${sectionAnchor(section.id)}"
        class="note${level === 1 ? ' reply' : ''}"
      >
        ${moment && markup`<p class="muted moment">[${moment}]</p>`}
        ${bodyHtml(section.body, 2, href, verses)}
        ${tags.length > 0 && markup`<p class="muted tags">${tags.map(tagLabel).join(' · ')}</p>`}
      </section>`;
    })}
    ${
      view.takeaways.length > 0 &&
      markup`<section>
        <h2>Takeaways</h2>
        <ul>
          ${view.takeaways.map((t) => markup`<li>${t}</li>`)}
        </ul>
      </section>`
    }
    ${
      view.questions.length > 0 &&
      markup`<section>
        <h2>Questions</h2>
        <ul class="questions">
          ${view.questions.map((q) => {
            const answered = q.status === 'answered';
            return markup`<li>
              <span aria-hidden="true">${answered ? '☑' : '☐'}</span
              ><span
                ><span class="sr-only">${answered ? 'Answered: ' : 'Open: '}</span
                >${q.text}${q.status === 'parked' && markup` <em class="muted">(parked)</em>`}</span
              >
            </li>`;
          })}
        </ul>
      </section>`
    }
  </article>`;
}

/** A lesson; `verses` reads its chips' text (`lessonRefs`). */
export function lessonPage(
  view: LessonView,
  href: ChipHref,
  verses: VerseReader,
  back?: { href: string; label: string },
): Page {
  return page({
    title: view.lesson.title,
    main: markup`${back && markup`<a class="back" href="${back.href}">← ${back.label}</a>`}${lessonArticle(view, href, verses)}`,
    footer: sharedFrom(
      lessonsCredit(
        [{ lesson: view.lesson, sections: view.rows.map((r) => r.section) }],
        verses.translation,
      ),
    ),
  });
}

/** Every reference a lesson's page quotes: its main passages and its sections' chips. */
export const lessonRefs = (view: LessonView) => [
  ...view.lesson.mainPassages,
  ...view.rows.flatMap((r) => citedRefs(r.section.body)),
];

/** Every reference a compile view quotes: the chips of the sections it shows in full. */
export const commentaryRefs = (view: CommentaryView) =>
  view.groups.flatMap((g) =>
    g.entries.filter((e) => !e.shownUnder).flatMap((e) => citedRefs(e.body)),
  );

/**
 * A series: its title and description, then its lessons in date order, each a page of its own.
 * Credited in `translation`, the owner's.
 */
export function seriesPage(
  view: SeriesView,
  lessonHref: (id: string) => string,
  translation: TranslationId,
): Page {
  const { series, lessons } = view;
  return page({
    title: series.title,
    main: markup`<header>
        <h1>${series.title}</h1>
        <div class="details">
          <p class="muted">
            ${SERIES_KIND_LABELS[series.kind]} · ${count(lessons.length, 'lesson')}
          </p>
        </div>
      </header>
      ${descriptionOf(series.description)}
      ${
        lessons.length > 0 &&
        markup`<ol class="lessons">
          ${lessons.map(
            (lesson) =>
              markup`<li>
                <span class="date">${shortDateWithYear(lesson.date)}</span
                ><a href="${lessonHref(lesson.id)}">${lesson.title}</a>
              </li>`,
          )}
        </ol>`
      }`,
    footer: sharedFrom(
      creditFor(
        lessons.flatMap((l) => l.mainPassages),
        translation,
      ),
    ),
  });
}

/** A series' description: its paragraphs, each line kept. */
function descriptionOf(description: string): Html {
  const text = description.trim();
  if (!text) return markup``;
  return markup`<div class="doc description">
    ${text
      .split(/\n\s*\n/)
      .map(
        (para) =>
          markup`<p>${para.split('\n').map((line, i) => markup`${i > 0 && markup`<br />`}${line}`)}</p>`,
      )}
  </div>`;
}

/**
 * A compile view, as the app's commentary (wireframes/thinking.md), with bylines as plain text.
 * `asOf` is the day a frozen link was made: "As of Friday 17 October 2026". `verses` reads its
 * chips' text (`commentaryRefs`).
 */
export function commentaryPage(
  view: CommentaryView,
  asOf: string | null,
  verses: VerseReader,
): Page {
  const shown = new Set(
    view.groups.flatMap((g) => g.entries.filter((e) => !e.shownUnder).map((e) => e.sectionId)),
  );
  const href: ChipHref = (link) =>
    link.targetType === 'section' && shown.has(link.targetId)
      ? `#${sectionAnchor(link.targetId)}`
      : null;
  const level = view.wholeBook ? 3 : 2;
  let chapter: number | null = null;
  const parts: Html[] = [];
  for (const group of view.groups) {
    if (view.wholeBook && group.passage.chapter !== chapter) {
      chapter = group.passage.chapter;
      parts.push(
        markup`<h2 class="chapter-heading">
          ${formatPassage({ book: group.passage.book, chapter })}
        </h2>`,
      );
    }
    parts.push(
      markup`<section class="group">
        ${level === 2 ? markup`<h2 class="group-heading">${formatPassage(group.passage)}</h2>` : markup`<h3 class="group-heading">${formatPassage(group.passage)}</h3>`}
        ${group.entries.map((entry) =>
          commentaryEntry(entry, view.wholeBook ? 4 : 3, href, verses),
        )}
      </section>`,
    );
  }
  return page({
    title: `Commentary on ${view.title}`,
    main: markup`<header>
        <h1>Commentary on ${view.title}</h1>
        <div class="details">
          ${asOf && markup`<p class="muted">As of ${longDate(asOf)}</p>`}
          <p class="muted">
            ${count(view.sections, 'section')} in ${count(view.lessons, 'lesson')}
          </p>
        </div>
      </header>
      ${parts}`,
    footer: sharedFrom(creditFor(commentaryRefs(view), verses.translation)),
  });
}

function commentaryEntry(
  entry: CommentaryEntry,
  headingLevel: 3 | 4,
  href: ChipHref,
  verses: VerseReader,
): Html {
  const byline = `${entry.lessonTitle} · ${shortDateWithYear(entry.lessonDate)}`;
  const cls = entry.nested ? 'entry reply' : 'entry';
  if (entry.shownUnder) {
    return markup`<div class="${cls}">
      <p class="muted">${byline} — under ${formatPassage(entry.shownUnder)}, above.</p>
    </div>`;
  }
  return markup`<div id="${sectionAnchor(entry.sectionId)}" class="${cls}">
    <div class="note">${bodyHtml(entry.body, headingLevel === 3 ? 4 : 5, href, verses)}</div>
    <p class="muted">${byline}</p>
    ${entry.also.length > 0 && markup`<p class="muted"><em>Also under ${entry.also.map((p: Passage) => formatPassage(p)).join(', ')}</em></p>`}
  </div>`;
}

/**
 * The handout (F33, M12-05), as its device made it when the link was (M13-03): one page, fitted
 * by measuring in the reader's browser (`HANDOUT_SCRIPT`), with a Print button.
 */
export function handoutPage(handout: HandoutSnapshot): Page {
  return page({
    title: handout.title,
    bodyClass: 'handout',
    script: HANDOUT_SCRIPT,
    main: markup`<div class="tools">
        <output></output><button type="button" data-print>Print</button>
      </div>
      <div class="handout-frame">
        <div class="handout-paper">
          <div class="handout-box">
            <header>
              <h1>${handout.title}</h1>
              <div class="details">${handout.details.map((line) => markup`<p>${line}</p>`)}</div>
            </header>
            ${
              handout.passages.length > 0 &&
              markup`<section class="passages" aria-label="Passages">
                ${handout.passages.map(
                  (p) =>
                    markup`<div>
                      <p class="passage">${p.label}</p>
                      ${
                        p.verses &&
                        markup`<p class="passage-text">
                          ${p.verses.map(
                            (v, i) => markup`${i > 0 && ' '}<sup>${v.label}</sup>${v.text}`,
                          )}
                        </p>`
                      }
                    </div>`,
                )}
              </section>`
            }
            ${
              handout.notes.length > 0 &&
              markup`<section data-fit="notes">
                <h2>Notes</h2>
                <ol class="notes">
                  ${handout.notes.map((n) => markup`<li><span>${n}</span></li>`)}
                </ol>
              </section>`
            }
            ${
              handout.takeaways.length > 0 &&
              markup`<section data-fit="takeaways">
                <h2>Takeaways</h2>
                <ul>
                  ${handout.takeaways.map((t) => markup`<li>${t}</li>`)}
                </ul>
              </section>`
            }
            ${
              handout.questions.length > 0 &&
              markup`<section data-fit="questions">
                <h2>Questions</h2>
                <ul class="questions">
                  ${handout.questions.map((q) => {
                    const answered = q.status === 'answered';
                    return markup`<li>
                      <span aria-hidden="true">${answered ? '☑' : '☐'}</span
                      ><span
                        ><span class="sr-only">${answered ? 'Answered: ' : 'Open: '}</span
                        >${q.text}</span
                      >
                    </li>`;
                  })}
                </ul>
              </section>`
            }
            <p class="credit">${handout.credit}</p>
          </div>
        </div>
      </div>`,
  });
}

/** Revoked, expired, mistyped or its target gone: the server answers 404 for all of them. */
export function notFoundPage(): Page {
  return page({
    title: 'Link not found',
    main: markup`<div class="gone">
      <h1>This link doesn’t work any more.</h1>
      <p class="muted">
        It may have expired or been turned off. Ask the person who shared it for a new one.
      </p>
    </div>`,
  });
}
