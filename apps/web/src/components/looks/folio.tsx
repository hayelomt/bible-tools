import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { LESSONS, NAV, type NavLabel, PASSAGE, SECTION, SERIES, STATS } from './sample.ts';

/** Folio: a printed study Bible. Type does the work; no cards, no shadows. */
export function FolioLook() {
  const [nav, setNav] = useState<NavLabel>('Lessons');
  return (
    <div data-look="folio" className="lk-grain min-h-full pb-20">
      <div className="mx-auto max-w-6xl px-5 lg:px-10">
        <header className="flex flex-col gap-4 pt-8">
          <div className="lk-smallcaps flex items-baseline justify-between text-sm text-(--lk-muted)">
            <span>Tuesday, 13 October</span>
            <span className="hidden sm:inline">Notes on the Word · Vol. III</span>
            <span>Offline · saved</span>
          </div>
          <div className="flex flex-col items-center gap-3 py-2 sm:flex-row sm:justify-between">
            <p
              className="lk-display text-6xl leading-none font-medium italic sm:text-7xl"
              style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 100, 'WONK' 1" }}
            >
              Lamp
            </p>
            <nav aria-label="Folio main">
              <ul className="lk-smallcaps flex gap-6 text-lg">
                {NAV.map((item) => (
                  <li key={item}>
                    <button
                      type="button"
                      aria-current={nav === item ? 'page' : undefined}
                      onClick={() => setNav(item)}
                      className="lk-link pb-0.5 outline-none focus-visible:text-(--lk-accent) aria-[current=page]:text-(--lk-accent)"
                    >
                      {item}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <div className="lk-rule-double" />
        </header>

        <div className="grid gap-x-14 gap-y-14 pt-10 lg:grid-cols-[1fr_20rem]">
          <section aria-labelledby="folio-recent" className="flex flex-col gap-8">
            <div className="flex flex-col gap-5">
              <h2
                id="folio-recent"
                className="lk-display text-5xl leading-[0.95] font-normal tracking-tight sm:text-6xl"
                style={{ fontVariationSettings: "'opsz' 144, 'SOFT' 30" }}
              >
                What you’ve <em className="text-(--lk-accent)">heard</em> lately
              </h2>
              <p className="lk-serif max-w-md text-lg leading-relaxed text-(--lk-muted)">
                {STATS.lessons} lessons, {STATS.verses} verses cited, and {STATS.questions}{' '}
                questions still open.
              </p>
              <div className="flex flex-wrap items-center gap-5">
                <button
                  type="button"
                  className="group flex items-center gap-3 bg-(--lk-ink) px-6 py-3.5 text-(--lk-bg) outline-none transition-colors hover:bg-(--lk-accent) focus-visible:ring-2 focus-visible:ring-(--lk-accent) focus-visible:ring-offset-2 focus-visible:ring-offset-(--lk-bg)"
                >
                  <span className="lk-smallcaps text-lg">Begin a new lesson</span>
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-1"
                    aria-hidden
                  />
                </button>
                <span className="text-sm text-(--lk-muted)">
                  or press{' '}
                  <kbd className="lk-mono border border-(--lk-line) px-1.5 py-0.5 text-xs">N</kbd>
                </span>
              </div>
            </div>

            <ol className="border-t border-(--lk-ink)">
              {LESSONS.map((lesson, i) => (
                <li key={lesson.title} className="border-b border-(--lk-line)">
                  <a
                    href="#folio-lesson"
                    className="group grid grid-cols-[2.5rem_1fr] items-baseline gap-x-4 py-5 outline-none focus-visible:bg-(--lk-accent-soft) sm:grid-cols-[3rem_1fr_auto]"
                  >
                    <span className="lk-display lk-tabular text-2xl text-(--lk-accent) italic">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="lk-display text-2xl leading-tight transition-transform duration-300 group-hover:translate-x-1 sm:text-3xl">
                        {lesson.title}
                      </span>
                      <span className="lk-smallcaps text-sm text-(--lk-muted)">
                        {lesson.passage}
                        {lesson.series && <> · {lesson.series}</>}
                      </span>
                    </span>
                    <span className="lk-smallcaps col-start-2 text-sm text-(--lk-muted) sm:col-start-3">
                      {lesson.weekday} {lesson.date}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </section>

          <aside className="flex flex-col gap-12">
            <section aria-labelledby="folio-series" className="flex flex-col gap-4">
              <h2 id="folio-series" className="lk-smallcaps border-b border-(--lk-ink) pb-2">
                Series
              </h2>
              <ul className="flex flex-col gap-3">
                {SERIES.map((s) => (
                  <li key={s.title} className="flex items-baseline gap-2">
                    <span className="lk-display text-xl">{s.title}</span>
                    <span className="lk-leader" aria-hidden />
                    <span className="lk-tabular text-sm text-(--lk-muted)">
                      {s.lessons} of {s.of}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="folio-reading" className="flex flex-col gap-4">
              <h2
                id="folio-reading"
                className="lk-smallcaps flex justify-between border-b border-(--lk-ink) pb-2"
              >
                <span>From the reading</span>
                <span className="text-(--lk-muted)">{PASSAGE.translation}</span>
              </h2>
              <p className="lk-serif text-[1.0625rem] leading-[1.7] [hyphens:auto] text-justify">
                {PASSAGE.verses.map((v) => (
                  <span key={v.n}>
                    <sup className="lk-display mr-0.5 text-xs font-semibold text-(--lk-accent)">
                      {v.n}
                    </sup>
                    <span className={v.n === PASSAGE.highlight ? 'bg-(--lk-accent-soft)' : ''}>
                      {v.text}
                    </span>{' '}
                  </span>
                ))}
              </p>
              <a
                href="#folio-reading"
                className="lk-smallcaps lk-link flex items-center gap-1 self-start text-(--lk-accent)"
              >
                Continue in {PASSAGE.reference.split(':')[0]}
                <ArrowUpRight className="size-3.5" aria-hidden />
              </a>
            </section>
          </aside>
        </div>

        <article
          id="folio-lesson"
          aria-labelledby="folio-section"
          className="mt-16 grid gap-10 border-t border-(--lk-ink) pt-8 lg:grid-cols-[1fr_20rem] lg:gap-14"
        >
          <div className="flex flex-col gap-6">
            <p className="lk-smallcaps text-sm text-(--lk-muted)">The Good Shepherd · § 2 of 4</p>
            <h2
              id="folio-section"
              className="lk-display text-4xl leading-tight italic"
              style={{ fontVariationSettings: "'opsz' 96, 'SOFT' 100" }}
            >
              {SECTION.heading}
            </h2>
            <p className="lk-serif lk-dropcap max-w-[38rem] text-[1.1875rem] leading-[1.65]">
              {SECTION.before}{' '}
              <a
                href="#folio-reading"
                className="lk-smallcaps border-b border-(--lk-accent) whitespace-nowrap text-(--lk-accent)"
              >
                {SECTION.chip}
              </a>{' '}
              {SECTION.after}
            </p>
            <blockquote className="relative my-2 max-w-[34rem] pl-10">
              <span
                className="lk-display absolute -top-3 left-0 text-7xl leading-none text-(--lk-accent)"
                aria-hidden
              >
                “
              </span>
              <p
                className="lk-display text-3xl leading-snug"
                style={{ fontVariationSettings: "'opsz' 72" }}
              >
                {SECTION.takeaway}
              </p>
              <footer className="lk-smallcaps mt-2 text-sm text-(--lk-muted)">Takeaway</footer>
            </blockquote>
          </div>
          <div className="flex flex-col gap-6 border-(--lk-line) lg:border-l lg:pl-8">
            <p className="lk-serif text-sm leading-relaxed text-(--lk-muted) italic">
              <span className="lk-smallcaps not-italic text-(--lk-accent)">In the margin · </span>
              {SECTION.reply}
            </p>
            <div className="flex flex-col gap-2 border-y border-(--lk-line) py-4">
              <span className="lk-smallcaps text-sm text-(--lk-muted)">Open question</span>
              <p className="lk-display text-xl leading-snug">{SECTION.question}</p>
              <label className="mt-1 flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-(--lk-accent)" />
                Answered
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="lk-smallcaps text-sm text-(--lk-muted)">Add a tag</span>
              <input
                placeholder="e.g. grace"
                className="lk-serif border-b border-(--lk-ink) bg-transparent py-1.5 text-lg outline-none placeholder:text-(--lk-muted)/70 focus:border-(--lk-accent)"
              />
            </label>
            <p className="lk-smallcaps text-sm">
              {SECTION.tags.map((t, i) => (
                <span key={t}>
                  {i > 0 && <span className="text-(--lk-muted)"> · </span>}
                  <a href="#folio-lesson" className="lk-link">
                    {t}
                  </a>
                </span>
              ))}
            </p>
          </div>
        </article>
      </div>
    </div>
  );
}
