import { ArrowUpRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { LESSONS, NAV, type NavLabel, PASSAGE, SECTION, SERIES, STATS } from './sample.ts';

const SERIES_TINT = ['bg-(--lk-coral)', 'bg-(--lk-sky)', 'bg-(--lk-zest)'] as const;
const FILTERS = ['All', 'Sermons', 'Studies'] as const;

/** Grid: Swiss and a little brutal. Big numbers, mono labels, ink borders, shadows that press. */
export function GridLook() {
  const [nav, setNav] = useState<NavLabel>('Lessons');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [answered, setAnswered] = useState(false);

  return (
    <div data-look="grid" className="min-h-full pb-20">
      <header className="border-b-2 border-(--lk-ink) bg-(--lk-ink) text-(--lk-bg)">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3 lg:px-8">
          <span className="text-2xl font-black tracking-[-0.06em]">LAMP®</span>
          <nav aria-label="Grid main" className="order-last w-full sm:order-none sm:w-auto">
            <ul className="lk-mono flex text-xs uppercase">
              {NAV.map((item, i) => (
                <li key={item}>
                  <button
                    type="button"
                    aria-current={nav === item ? 'page' : undefined}
                    onClick={() => setNav(item)}
                    className="h-9 px-3 outline-none hover:text-(--lk-zest) focus-visible:ring-2 focus-visible:ring-(--lk-zest) aria-[current=page]:bg-(--lk-zest) aria-[current=page]:text-(--lk-ink)"
                  >
                    <span className="opacity-50">0{i + 1}</span> {item}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <span className="lk-mono ml-auto text-xs uppercase opacity-70">● Offline · 13.10.26</span>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 pt-10 lg:px-8">
        <section className="grid items-end gap-6 lg:grid-cols-[auto_1fr]">
          <div className="flex items-end gap-4">
            <span className="lk-tight text-[9rem] font-black tabular-nums sm:text-[12rem]">
              {STATS.lessons}
            </span>
            <span className="lk-mono mb-4 text-xs leading-tight uppercase">
              Lessons
              <br />
              recorded
              <br />
              <span className="text-(--lk-accent)">↑ 4 this month</span>
            </span>
          </div>
          <div className="flex flex-col gap-4 lg:items-end">
            <button
              type="button"
              className="lk-hard flex h-16 items-center justify-between gap-6 bg-(--lk-zest) px-6 text-xl font-extrabold tracking-tight uppercase outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--lk-accent) lg:w-96"
            >
              New lesson
              <Plus className="size-7" strokeWidth={3} aria-hidden />
            </button>
            <dl className="grid w-full grid-cols-3 border-2 border-(--lk-ink) bg-(--lk-surface) lg:w-96">
              {(
                [
                  ['Verses', STATS.verses],
                  ['Open Qs', STATS.questions],
                  ['Streak', `${STATS.streak}w`],
                ] as const
              ).map(([label, value], i) => (
                <div
                  key={label}
                  className={`flex flex-col p-3 ${i > 0 ? 'border-l-2 border-(--lk-ink)' : ''}`}
                >
                  <dt className="lk-mono order-last text-[0.6875rem] uppercase">{label}</dt>
                  <dd className="text-3xl font-extrabold tracking-tight tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section aria-labelledby="grid-recent" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="grid-recent" className="lk-tight text-5xl font-black uppercase">
              Recent
            </h2>
            <fieldset className="lk-mono flex border-2 border-(--lk-ink) text-xs uppercase">
              <legend className="sr-only">Filter</legend>
              {FILTERS.map((f, i) => (
                <label
                  key={f}
                  className={`relative flex h-9 cursor-pointer items-center px-3 has-checked:bg-(--lk-ink) has-checked:text-(--lk-bg) has-focus-visible:ring-2 has-focus-visible:ring-(--lk-accent) has-focus-visible:ring-inset ${i > 0 ? 'border-l-2 border-(--lk-ink)' : ''}`}
                >
                  <input
                    type="radio"
                    name="grid-filter"
                    checked={filter === f}
                    onChange={() => setFilter(f)}
                    className="absolute inset-0 cursor-pointer appearance-none opacity-0"
                  />
                  {f}
                </label>
              ))}
            </fieldset>
          </div>
          <div className="lk-hard bg-(--lk-surface)">
            <div className="lk-mono hidden grid-cols-[3.5rem_1fr_12rem_6rem] border-b-2 border-(--lk-ink) px-4 py-2 text-[0.6875rem] uppercase sm:grid">
              <span>No.</span>
              <span>Title</span>
              <span>Passage</span>
              <span className="text-right">Date</span>
            </div>
            <ul className="divide-y-2 divide-(--lk-ink)">
              {LESSONS.map((lesson, i) => (
                <li key={lesson.title}>
                  <a
                    href="#grid-lesson"
                    className="group grid grid-cols-[3.5rem_1fr] items-baseline gap-y-1 px-4 py-3.5 outline-none transition-colors hover:bg-(--lk-zest) focus-visible:bg-(--lk-zest) sm:grid-cols-[3.5rem_1fr_12rem_6rem]"
                  >
                    <span className="lk-mono text-sm tabular-nums">
                      {String(LESSONS.length - i).padStart(3, '0')}
                    </span>
                    <span className="flex items-center gap-2 text-xl font-bold tracking-tight">
                      {lesson.title}
                      <ArrowUpRight
                        className="size-5 opacity-0 transition-opacity group-hover:opacity-100"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                    </span>
                    <span className="lk-mono col-start-2 text-sm sm:col-start-3">
                      {lesson.passage}
                    </span>
                    <span className="lk-mono col-start-2 text-sm text-(--lk-muted) sm:col-start-4 sm:text-right">
                      {lesson.date}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="grid-series" className="flex flex-col gap-3">
          <h2 id="grid-series" className="lk-tight text-5xl font-black uppercase">
            Series
          </h2>
          <ul className="grid gap-5 sm:grid-cols-3">
            {SERIES.map((s, i) => (
              <li key={s.title}>
                <a
                  href="#grid-series"
                  aria-label={`${s.title}, ${s.lessons} of ${s.of} lessons`}
                  className={`lk-hard ${SERIES_TINT[i]} flex h-full flex-col gap-6 p-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--lk-accent)`}
                >
                  <span className="flex items-start justify-between">
                    <span className="text-2xl leading-none font-extrabold tracking-tight">
                      {s.title}
                    </span>
                    <span className="lk-mono text-xs">
                      {s.lessons}/{s.of}
                    </span>
                  </span>
                  <span className="mt-auto flex flex-col gap-2">
                    <span className="flex gap-0.5" aria-hidden>
                      {Array.from({ length: s.of }, (_, n) => (
                        <span
                          key={n}
                          className={`h-3 flex-1 border-2 border-(--lk-ink) ${n < s.lessons ? 'bg-(--lk-ink)' : ''}`}
                        />
                      ))}
                    </span>
                    <span className="lk-mono text-[0.6875rem] uppercase">{s.note}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
          <article
            id="grid-lesson"
            aria-labelledby="grid-section"
            className="lk-hard flex flex-col bg-(--lk-surface)"
          >
            <div className="lk-mono flex justify-between border-b-2 border-(--lk-ink) px-5 py-2 text-[0.6875rem] uppercase">
              <span>The Good Shepherd</span>
              <span>§ 02 / 04</span>
            </div>
            <div className="flex flex-col gap-4 p-5">
              <h2 id="grid-section" className="text-3xl font-black tracking-[-0.04em]">
                {SECTION.heading}
              </h2>
              <p className="lk-serif text-[1.125rem] leading-[1.65]">
                {SECTION.before} <Chip>{SECTION.chip}</Chip> {SECTION.after}
              </p>
              <p className="lk-serif border-l-4 border-(--lk-accent) pl-4 leading-[1.65]">
                {SECTION.reply} <Chip>{SECTION.replyChip}</Chip>
              </p>
              <ul className="lk-mono flex flex-wrap gap-2 text-xs uppercase">
                {SECTION.tags.map((t) => (
                  <li key={t} className="border-2 border-(--lk-ink) px-2 py-0.5">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid border-t-2 border-(--lk-ink) sm:grid-cols-2">
              <div className="bg-(--lk-accent) p-5 text-(--lk-accent-ink)">
                <p className="lk-mono text-[0.6875rem] uppercase opacity-80">→ Takeaway</p>
                <p className="mt-2 text-xl leading-tight font-bold tracking-tight">
                  {SECTION.takeaway}
                </p>
              </div>
              <div className="relative overflow-hidden border-t-2 border-(--lk-ink) p-5 sm:border-t-0 sm:border-l-2">
                <span
                  className="lk-tight pointer-events-none absolute -right-2 -bottom-8 text-[9rem] font-black text-(--lk-ink)/8"
                  aria-hidden
                >
                  ?
                </span>
                <p className="lk-mono text-[0.6875rem] uppercase">Open question</p>
                <p className="mt-2 text-xl leading-tight font-bold tracking-tight">
                  {SECTION.question}
                </p>
                <label className="lk-mono mt-4 flex w-fit cursor-pointer items-center gap-2 text-xs uppercase">
                  <input
                    type="checkbox"
                    checked={answered}
                    onChange={(e) => setAnswered(e.target.checked)}
                    className="grid size-5 cursor-pointer appearance-none place-items-center border-2 border-(--lk-ink) checked:bg-(--lk-ink) checked:after:text-(--lk-zest) checked:after:content-['✓'] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--lk-accent)"
                  />
                  Answered
                </label>
              </div>
            </div>
          </article>

          <section aria-labelledby="grid-reading" className="flex flex-col gap-3">
            <h2 id="grid-reading" className="flex items-baseline justify-between">
              <span className="text-2xl font-black tracking-tight">{PASSAGE.reference}</span>
              <span className="lk-mono bg-(--lk-ink) px-1.5 text-xs text-(--lk-bg)">
                {PASSAGE.translation}
              </span>
            </h2>
            <div className="lk-serif flex flex-col border-t-2 border-(--lk-ink)">
              {PASSAGE.verses.map((v) => (
                <p
                  key={v.n}
                  className={`grid grid-cols-[2.75rem_1fr] border-b border-(--lk-ink)/20 py-3 leading-[1.6] ${v.n === PASSAGE.highlight ? 'bg-(--lk-zest)' : ''}`}
                >
                  <span
                    className="pl-1 font-sans text-2xl font-black tracking-tight text-(--lk-accent)"
                    aria-hidden
                  >
                    {v.n}
                  </span>
                  <span className="pr-2">{v.text}</span>
                </p>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: string }) {
  return (
    <button
      type="button"
      className="lk-mono inline-flex translate-y-[-2px] items-center border-2 border-(--lk-ink) bg-(--lk-zest) px-1.5 align-baseline text-[0.72em] font-semibold uppercase outline-none hover:bg-(--lk-ink) hover:text-(--lk-zest) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--lk-accent)"
    >
      {children}
    </button>
  );
}
