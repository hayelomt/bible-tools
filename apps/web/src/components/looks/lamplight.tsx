import {
  ArrowRight,
  BookOpen,
  CircleHelp,
  Command,
  Flame,
  ListChecks,
  NotebookPen,
  Plus,
  Search,
  Settings,
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

/** Lamplight: a dark study lit by one lamp. Glass panels, lit edges, amber for what matters. */
export function LamplightLook() {
  const [nav, setNav] = useState<NavLabel>('Lessons');
  return (
    <div data-look="lamplight" className="min-h-full">
      <div className="mx-auto flex max-w-7xl gap-6 p-4 lg:p-6">
        <aside className="lk-panel sticky top-20 hidden h-[calc(100svh-6.5rem)] w-60 shrink-0 flex-col gap-8 rounded-2xl p-4 lg:flex">
          <div className="flex items-center gap-2.5 px-2 pt-1">
            <Flame className="lk-flame size-5 text-(--lk-accent)" aria-hidden />
            <span className="font-semibold tracking-tight">Lamp</span>
          </div>
          <nav aria-label="Lamplight main">
            <ul className="flex flex-col gap-0.5">
              {NAV.map((item) => {
                const Icon = NAV_ICONS[item];
                return (
                  <li key={item}>
                    <button
                      type="button"
                      aria-current={nav === item ? 'page' : undefined}
                      onClick={() => setNav(item)}
                      className="relative flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm text-(--lk-muted) outline-none transition-colors hover:bg-white/4 hover:text-(--lk-ink) focus-visible:ring-1 focus-visible:ring-(--lk-accent) aria-[current=page]:bg-white/6 aria-[current=page]:text-(--lk-ink)"
                    >
                      {nav === item && (
                        <span className="absolute top-2 bottom-2 -left-4 w-0.5 rounded-full bg-(--lk-accent) shadow-[0_0_12px_2px_var(--lk-accent)]" />
                      )}
                      <Icon className="size-4" aria-hidden />
                      {item}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <section aria-labelledby="lamp-series" className="flex flex-col gap-1">
            <h2
              id="lamp-series"
              className="lk-mono px-3 pb-1 text-[0.6875rem] tracking-widest text-(--lk-muted) uppercase"
            >
              Series
            </h2>
            {SERIES.map((s) => (
              <a
                key={s.title}
                href="#lamp-series"
                className="flex h-8 items-center justify-between rounded-lg px-3 text-sm text-(--lk-muted) outline-none hover:bg-white/4 hover:text-(--lk-ink) focus-visible:ring-1 focus-visible:ring-(--lk-accent)"
              >
                {s.title}
                <span className="lk-mono text-xs">{s.lessons}</span>
              </a>
            ))}
          </section>
          <div className="mt-auto flex flex-col gap-1">
            <p className="flex items-center gap-2 px-3 py-1.5 text-xs text-(--lk-muted)">
              <span className="size-1.5 rounded-full bg-(--lk-accent) shadow-[0_0_8px_var(--lk-accent)]" />
              Saved on this device
            </p>
            <button
              type="button"
              className="flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-(--lk-muted) outline-none hover:bg-white/4 hover:text-(--lk-ink) focus-visible:ring-1 focus-visible:ring-(--lk-accent)"
            >
              <Settings className="size-4" aria-hidden />
              Settings
            </button>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="lk-panel flex h-12 items-center gap-3 rounded-xl px-4 text-sm text-(--lk-muted)">
            <Search className="size-4" aria-hidden />
            <input
              placeholder="Search notes, or jump to a passage like “Jn 10”"
              className="min-w-0 flex-1 bg-transparent text-(--lk-ink) outline-none placeholder:text-(--lk-muted)"
            />
            <kbd className="lk-mono hidden items-center gap-0.5 rounded-md border border-(--lk-line) px-1.5 py-0.5 text-xs sm:flex">
              <Command className="size-3" aria-hidden />K
            </kbd>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
            <section className="lk-panel-lit flex flex-col justify-between gap-8 rounded-2xl p-6 md:col-span-4 md:min-h-64">
              <div className="flex flex-col gap-3">
                <p className="lk-mono text-xs tracking-widest text-(--lk-accent) uppercase">
                  Tuesday · 13 Oct
                </p>
                <h2 className="max-w-md text-4xl leading-[1.05] font-semibold tracking-[-0.035em] sm:text-5xl">
                  <span className="lk-text-glow">A light</span> for your next lesson.
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="lk-glow flex h-11 items-center gap-2 rounded-xl bg-(--lk-accent) px-5 text-sm font-semibold text-(--lk-accent-ink) outline-none transition-transform hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-(--lk-ink)"
                >
                  <Plus className="size-4" aria-hidden />
                  New lesson
                </button>
                <button
                  type="button"
                  className="group flex h-11 items-center gap-2 rounded-xl px-4 text-sm text-(--lk-muted) outline-none hover:text-(--lk-ink) focus-visible:ring-1 focus-visible:ring-(--lk-accent)"
                >
                  Continue “The Good Shepherd”
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </button>
              </div>
            </section>

            <section
              aria-label="Activity"
              className="lk-panel flex flex-col justify-between gap-4 rounded-2xl p-5 md:col-span-2"
            >
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['lessons', STATS.lessons],
                    ['verses', STATS.verses],
                    ['open', STATS.questions],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex flex-col">
                    <span className="text-2xl font-semibold tracking-tight tabular-nums">
                      {value}
                    </span>
                    <span className="lk-mono text-[0.6875rem] text-(--lk-muted) uppercase">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
              <Sparkline />
              <p className="flex items-center justify-between text-xs text-(--lk-muted)">
                <span>12 weeks</span>
                <span className="flex items-center gap-1 text-(--lk-accent)">
                  <Flame className="size-3" aria-hidden />
                  {STATS.streak}-week streak
                </span>
              </p>
            </section>

            <section
              aria-labelledby="lamp-recent"
              className="lk-panel flex flex-col rounded-2xl p-2 md:col-span-3"
            >
              <h2 id="lamp-recent" className="flex items-center justify-between px-3 pt-3 pb-2">
                <span className="text-sm font-medium">Recent</span>
                <span className="lk-mono text-xs text-(--lk-muted)">{STATS.lessons} total</span>
              </h2>
              <ul>
                {LESSONS.map((lesson) => (
                  <li key={lesson.title}>
                    <a
                      href="#lamp-lesson"
                      className="grid grid-cols-[3.25rem_1fr] items-baseline gap-x-3 rounded-lg px-3 py-2.5 outline-none transition-colors hover:bg-white/4 focus-visible:ring-1 focus-visible:ring-(--lk-accent)"
                    >
                      <span className="lk-mono text-xs text-(--lk-muted)">{lesson.date}</span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-sm font-medium">{lesson.title}</span>
                        <span className="lk-mono truncate text-xs text-(--lk-accent)/80">
                          {lesson.passage}
                          {lesson.series && (
                            <span className="text-(--lk-muted)"> / {lesson.series}</span>
                          )}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>

            <section
              aria-labelledby="lamp-reading"
              className="lk-panel flex flex-col gap-4 rounded-2xl p-5 md:col-span-3"
            >
              <h2 id="lamp-reading" className="flex items-center justify-between">
                <span className="text-sm font-medium">{PASSAGE.reference}</span>
                <span className="lk-mono rounded-md border border-(--lk-line) px-1.5 py-0.5 text-[0.6875rem] text-(--lk-muted)">
                  {PASSAGE.translation}
                </span>
              </h2>
              <div className="lk-serif flex flex-col gap-2.5 text-[1.0625rem] leading-[1.7] text-(--lk-ink)/90">
                {PASSAGE.verses.map((v) => (
                  <p key={v.n} className="grid grid-cols-[1.75rem_1fr]">
                    <span className="lk-mono pt-1 text-[0.6875rem] text-(--lk-muted)" aria-hidden>
                      {v.n}
                    </span>
                    <span
                      className={
                        v.n === PASSAGE.highlight
                          ? 'text-(--lk-ink) underline decoration-(--lk-accent)/70 decoration-2 underline-offset-[5px]'
                          : ''
                      }
                    >
                      {v.text}
                    </span>
                  </p>
                ))}
              </div>
            </section>

            <article
              id="lamp-lesson"
              aria-labelledby="lamp-section"
              className="lk-panel grid gap-6 rounded-2xl p-6 md:col-span-6 lg:grid-cols-[1fr_20rem]"
            >
              <div className="flex flex-col gap-4">
                <p className="lk-mono text-xs text-(--lk-muted)">
                  the-good-shepherd <span className="text-(--lk-accent)">/</span> section 2
                </p>
                <h2 id="lamp-section" className="text-2xl font-semibold tracking-tight">
                  {SECTION.heading}
                </h2>
                <p className="lk-serif max-w-[40rem] text-[1.125rem] leading-[1.7] text-(--lk-ink)/90">
                  {SECTION.before} <Chip>{SECTION.chip}</Chip> {SECTION.after}
                </p>
                <p className="lk-serif max-w-[38rem] border-l border-(--lk-line) pl-4 leading-[1.7] text-(--lk-muted)">
                  {SECTION.reply} <Chip>{SECTION.replyChip}</Chip>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SECTION.tags.map((t) => (
                    <span
                      key={t}
                      className="lk-mono rounded-md border border-(--lk-line) bg-white/3 px-2 py-0.5 text-xs text-(--lk-muted)"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <div className="relative overflow-hidden rounded-xl bg-(--lk-accent)/8 p-4 pl-5">
                  <span className="absolute inset-y-0 left-0 w-0.5 bg-linear-to-b from-(--lk-accent) to-(--lk-ember) shadow-[0_0_14px_var(--lk-accent)]" />
                  <p className="lk-mono text-[0.6875rem] tracking-widest text-(--lk-accent) uppercase">
                    Takeaway
                  </p>
                  <p className="mt-1.5 leading-snug">{SECTION.takeaway}</p>
                </div>
                <div className="rounded-xl border border-dashed border-(--lk-line) p-4">
                  <p className="lk-mono flex items-center gap-1.5 text-[0.6875rem] tracking-widest text-(--lk-muted) uppercase">
                    <CircleHelp className="size-3" aria-hidden />
                    Open question
                  </p>
                  <p className="mt-1.5 leading-snug">{SECTION.question}</p>
                  <button
                    type="button"
                    className="mt-3 h-8 rounded-lg border border-(--lk-line) px-3 text-xs text-(--lk-muted) outline-none hover:border-(--lk-accent)/50 hover:text-(--lk-ink) focus-visible:ring-1 focus-visible:ring-(--lk-accent)"
                  >
                    Mark answered
                  </button>
                </div>
              </div>
            </article>
          </div>
        </main>
      </div>
    </div>
  );
}

function Chip({ children }: { children: string }) {
  return (
    <button
      type="button"
      className="lk-mono inline-flex translate-y-[-1px] items-center rounded-md border border-(--lk-accent)/40 bg-(--lk-accent)/10 px-1.5 align-baseline text-[0.78em] text-(--lk-accent) outline-none transition-shadow hover:shadow-[0_0_16px_-2px_var(--lk-accent)] focus-visible:ring-1 focus-visible:ring-(--lk-accent)"
    >
      {children}
    </button>
  );
}

function Sparkline() {
  const max = Math.max(...ACTIVITY);
  const points = ACTIVITY.map((n, i) => [(i / (ACTIVITY.length - 1)) * 100, 38 - (n / max) * 32]);
  const line = points.map(([x, y]) => `${x},${y}`).join(' ');
  const [lastX, lastY] = points.at(-1)!;
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="h-16 w-full overflow-visible"
      aria-hidden
    >
      <defs>
        <linearGradient id="lamp-spark" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--lk-accent)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--lk-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,40 ${line} 100,40`} fill="url(#lamp-spark)" />
      <polyline
        points={line}
        fill="none"
        stroke="var(--lk-accent)"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r="2.5" fill="var(--lk-accent)" className="lk-flame" />
    </svg>
  );
}
