import {
  BookOpen,
  ChevronRight,
  CircleHelp,
  Flame,
  GripVertical,
  ListChecks,
  NotebookPen,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import {
  ACTIVITY,
  LESSONS,
  NAV,
  type NavLabel,
  PASSAGE,
  SECTION,
  SERIES,
  STATS,
} from './sample.ts';

const NAV_ICONS = { Lessons: NotebookPen, Read: BookOpen, Search, Review: ListChecks } as const;
const BOOK_TINT: Record<string, string> = {
  Jn: 'bg-(--lk-sky)',
  Gn: 'bg-(--lk-sage)',
  Lk: 'bg-(--lk-butter)',
};
const MODES = ['Light', 'Dark', 'Auto'] as const;

/** Soft: tactile paper on a warm wash. Rounded, layered, friendly; one warm gradient for action. */
export function SoftLook() {
  const [nav, setNav] = useState<NavLabel>('Lessons');
  const [mode, setMode] = useState<(typeof MODES)[number]>('Auto');
  const [sync, setSync] = useState(true);

  return (
    <div data-look="soft" className="lk-grain min-h-full">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pt-6 pb-32 lg:px-8">
        <header className="flex items-center gap-3">
          <span className="lk-cta grid size-10 place-items-center rounded-2xl">
            <Flame className="size-5" aria-hidden />
          </span>
          <span className="text-xl font-semibold tracking-tight">Lamp</span>
          <label className="lk-sunk ml-auto hidden h-11 w-80 items-center gap-2 rounded-full px-4 text-(--lk-muted) sm:flex">
            <Search className="size-4" aria-hidden />
            <input
              placeholder="Search notes and verses"
              className="min-w-0 flex-1 bg-transparent text-(--lk-ink) outline-none placeholder:text-(--lk-muted)"
            />
            <kbd className="rounded-md bg-(--lk-surface) px-1.5 text-xs">/</kbd>
          </label>
          <span className="lk-raised ml-auto flex h-9 items-center gap-2 rounded-full px-3 text-sm sm:ml-0">
            <span className="size-2 rounded-full bg-(--lk-ok) ring-3 ring-(--lk-ok)/20" />
            Saved
          </span>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <section className="lk-raised flex flex-col gap-6 rounded-[28px] p-6 sm:p-8">
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-1.5 text-sm font-medium text-(--lk-accent)">
                <Sparkles className="size-4" aria-hidden />
                Good morning
              </p>
              <h2 className="text-4xl leading-[1.05] font-semibold tracking-[-0.03em] sm:text-5xl">
                Pick up where
                <br />
                you left off.
              </h2>
            </div>
            <figure className="lk-sunk flex flex-col gap-2 rounded-2xl p-5">
              <blockquote className="lk-serif text-lg leading-relaxed">
                “{PASSAGE.verses[3].text.replace(/;$/, '.')}”
              </blockquote>
              <figcaption className="text-sm text-(--lk-muted)">
                John 10:14 · in “The Good Shepherd”
              </figcaption>
            </figure>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="lk-cta flex h-13 items-center gap-2 rounded-full pr-6 pl-5 text-base font-semibold outline-none focus-visible:ring-4 focus-visible:ring-(--lk-accent)/30"
              >
                <Plus className="size-5" aria-hidden />
                New lesson
              </button>
              <button
                type="button"
                className="lk-raised flex h-13 items-center gap-2 rounded-full px-5 font-medium outline-none hover:brightness-[0.98] focus-visible:ring-4 focus-visible:ring-(--lk-accent)/30"
              >
                <BookOpen className="size-4" aria-hidden />
                Keep reading John 10
              </button>
            </div>
          </section>

          <section
            aria-label="This month"
            className="lk-raised flex flex-col gap-5 rounded-[28px] p-6"
          >
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  ['Lessons', STATS.lessons, 'bg-(--lk-butter)'],
                  ['Verses', STATS.verses, 'bg-(--lk-sage)'],
                  ['Open', STATS.questions, 'bg-(--lk-sky)'],
                ] as const
              ).map(([label, value, tint]) => (
                <div key={label} className={`${tint} flex flex-col gap-1 rounded-2xl p-3.5`}>
                  <span className="text-3xl font-semibold tracking-tight tabular-nums">
                    {value}
                  </span>
                  <span className="text-sm text-(--lk-ink)/70">{label}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <h2 className="font-semibold">Weekly rhythm</h2>
                <span className="flex items-center gap-1 text-sm text-(--lk-accent)">
                  <Flame className="size-3.5" aria-hidden />
                  {STATS.streak} weeks
                </span>
              </div>
              <div className="flex h-24 items-end gap-1.5" aria-hidden>
                {ACTIVITY.map((n, i) => (
                  <span
                    key={i}
                    className={`flex-1 rounded-full ${i === ACTIVITY.length - 1 ? 'lk-cta' : 'lk-sunk'}`}
                    style={{ height: `${Math.max(n, 0.4) * 22}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="mt-auto flex flex-col gap-3 border-t border-(--lk-line) pt-4">
              <fieldset className="lk-sunk relative grid grid-cols-3 rounded-full p-1">
                <legend className="sr-only">Appearance</legend>
                <span
                  className="lk-raised absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full transition-transform duration-300 ease-[cubic-bezier(0.3,1.3,0.5,1)]"
                  style={{ transform: `translateX(${MODES.indexOf(mode) * 100}%)` }}
                  aria-hidden
                />
                {MODES.map((m) => (
                  <label
                    key={m}
                    className="relative grid h-9 cursor-pointer place-items-center rounded-full text-sm font-medium text-(--lk-muted) has-checked:text-(--lk-ink) has-focus-visible:ring-2 has-focus-visible:ring-(--lk-accent)/40"
                  >
                    <input
                      type="radio"
                      name="soft-mode"
                      checked={mode === m}
                      onChange={() => setMode(m)}
                      className="absolute inset-0 cursor-pointer appearance-none opacity-0"
                    />
                    {m}
                  </label>
                ))}
              </fieldset>
              <label className="flex cursor-pointer items-center justify-between text-sm font-medium">
                Sync across devices
                <span className="relative h-8 w-14">
                  <input
                    type="checkbox"
                    role="switch"
                    aria-checked={sync}
                    checked={sync}
                    onChange={(e) => setSync(e.target.checked)}
                    className="peer absolute inset-0 cursor-pointer appearance-none rounded-full outline-none"
                  />
                  <span
                    className={`pointer-events-none absolute inset-0 rounded-full p-1 transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-(--lk-accent)/30 ${sync ? 'lk-cta' : 'lk-sunk'}`}
                  >
                    <span
                      className={`block size-6 rounded-full bg-(--lk-surface) shadow-[0_2px_6px_oklch(0.3_0.03_50/0.3)] transition-transform duration-300 ease-[cubic-bezier(0.3,1.4,0.5,1)] ${sync ? 'translate-x-6' : ''}`}
                    />
                  </span>
                </span>
              </label>
            </div>
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <section
            aria-labelledby="soft-recent"
            className="lk-raised flex flex-col rounded-[28px] p-3"
          >
            <h2 id="soft-recent" className="px-3 pt-3 pb-2 text-lg font-semibold">
              Recent lessons
            </h2>
            <ul className="flex flex-col">
              {LESSONS.map((lesson) => (
                <li key={lesson.title}>
                  <a
                    href="#soft-lesson"
                    className="group flex items-center gap-4 rounded-2xl p-3 outline-none transition-colors hover:bg-(--lk-sunk)/60 focus-visible:bg-(--lk-sunk)"
                  >
                    <span
                      className={`${BOOK_TINT[lesson.book]} lk-serif grid size-12 shrink-0 place-items-center rounded-2xl text-lg font-semibold italic`}
                    >
                      {lesson.book}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-semibold">{lesson.title}</span>
                      <span className="truncate text-sm text-(--lk-muted)">
                        {lesson.weekday} {lesson.date} · {lesson.passage}
                      </span>
                    </span>
                    {lesson.series && (
                      <span className="hidden rounded-full bg-(--lk-sunk) px-2.5 py-1 text-xs font-medium text-(--lk-muted) sm:inline">
                        {lesson.series}
                      </span>
                    )}
                    <ChevronRight
                      className="size-4 text-(--lk-muted) transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="soft-series" className="flex flex-col gap-4">
            <h2 id="soft-series" className="px-1 text-lg font-semibold">
              Series
            </h2>
            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-3 lg:grid-cols-1">
              {SERIES.map((s) => (
                <li key={s.title}>
                  <a
                    href="#soft-series"
                    className="lk-stack flex items-center gap-4 rounded-3xl bg-(--lk-surface) p-4 outline-none focus-visible:ring-4 focus-visible:ring-(--lk-accent)/30"
                  >
                    <ProgressRing value={s.lessons / s.of} />
                    <span className="flex min-w-0 flex-col">
                      <span className="font-semibold">{s.title}</span>
                      <span className="text-sm text-(--lk-muted)">
                        {s.lessons} of {s.of} · {s.note}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <article
          id="soft-lesson"
          aria-labelledby="soft-section"
          className="lk-raised grid gap-6 rounded-[28px] p-6 sm:p-8 lg:grid-cols-[1fr_18rem]"
        >
          <div className="flex gap-3">
            <GripVertical className="mt-1.5 size-5 shrink-0 text-(--lk-muted)/60" aria-hidden />
            <div className="flex flex-col gap-4">
              <p className="text-sm font-medium text-(--lk-muted)">The Good Shepherd</p>
              <h2 id="soft-section" className="text-2xl font-semibold tracking-tight">
                {SECTION.heading}
              </h2>
              <p className="lk-serif text-[1.125rem] leading-[1.7]">
                {SECTION.before} <Chip>{SECTION.chip}</Chip> {SECTION.after}
              </p>
              <div className="relative ml-2 border-l-2 border-dashed border-(--lk-line) pl-5">
                <p className="lk-serif leading-[1.7] text-(--lk-ink)/85">
                  {SECTION.reply} <Chip>{SECTION.replyChip}</Chip>
                </p>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {SECTION.tags.map((t) => (
                  <span key={t} className="lk-sunk rounded-full px-3 py-1 text-sm">
                    # {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <div className="-rotate-1 rounded-2xl bg-(--lk-butter) p-5 shadow-[0_12px_24px_-12px_oklch(0.5_0.1_90/0.6)] transition-transform hover:rotate-0">
              <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-(--lk-ink)/60 uppercase">
                <Sparkles className="size-3.5" aria-hidden />
                Takeaway
              </p>
              <p className="lk-serif mt-2 text-lg leading-snug">{SECTION.takeaway}</p>
            </div>
            <div className="rotate-1 rounded-2xl bg-(--lk-sky) p-5 shadow-[0_12px_24px_-12px_oklch(0.5_0.06_235/0.6)] transition-transform hover:rotate-0">
              <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-(--lk-ink)/60 uppercase">
                <CircleHelp className="size-3.5" aria-hidden />
                Question
              </p>
              <p className="lk-serif mt-2 text-lg leading-snug">{SECTION.question}</p>
            </div>
          </div>
        </article>
      </div>

      <nav
        aria-label="Soft main"
        className="lk-glass sticky bottom-5 mx-auto flex w-fit gap-1 rounded-full p-1.5"
      >
        {NAV.map((item) => {
          const Icon = NAV_ICONS[item];
          const active = nav === item;
          return (
            <button
              key={item}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => setNav(item)}
              className={`flex h-12 items-center gap-2 rounded-full px-4 text-sm font-medium outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-(--lk-accent)/40 ${active ? 'lk-cta' : 'text-(--lk-muted) hover:text-(--lk-ink)'}`}
            >
              <Icon className="size-5" aria-hidden />
              <span className={active ? '' : 'sr-only sm:not-sr-only'}>{item}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function Chip({ children }: { children: string }) {
  return (
    <button
      type="button"
      className="inline-flex translate-y-[-1px] items-center gap-1 rounded-full bg-(--lk-accent)/12 px-2.5 py-0.5 align-baseline font-sans text-[0.85em] font-semibold text-(--lk-accent) outline-none transition-colors hover:bg-(--lk-accent)/20 focus-visible:ring-2 focus-visible:ring-(--lk-accent)/40"
    >
      <BookOpen className="size-3.5" aria-hidden />
      {children}
    </button>
  );
}

function ProgressRing({ value }: { value: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 48 48" className="size-12 shrink-0 -rotate-90" aria-hidden>
      <circle cx="24" cy="24" r={r} fill="none" strokeWidth="5" className="stroke-(--lk-sunk)" />
      <circle
        cx="24"
        cy="24"
        r={r}
        fill="none"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${c * value} ${c}`}
        className="stroke-(--lk-accent)"
      />
    </svg>
  );
}
