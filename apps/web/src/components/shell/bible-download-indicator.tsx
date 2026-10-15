import { TRANSLATION_NAMES, TRANSLATIONS, type TranslationId } from '@lamp/domain';
import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { type DownloadState, useBibleDownloads } from '@/data/bible-download.ts';
import { useAfter } from '@/lib/use-after.ts';

/** Loading states show only after this long (wireframes/states.md "Loading"). */
const SHOW_AFTER_MS = 300;

/**
 * The Bible download's progress beside the sync status (wireframes/shell.md "Bible download"):
 * a ring that fills as books arrive and "Bible 45/66" ("45/66" on a phone, the ring alone on the
 * narrowest), while a translation downloads. It opens Settings, where the download is. Gone once
 * it's done or paused; Settings says why it paused.
 */
export function BibleDownloadIndicator({ className }: { className?: string }) {
  const downloads = useBibleDownloads();
  const translation = TRANSLATIONS.find((t) => {
    const status = downloads.get(t)?.status;
    return status === 'starting' || status === 'downloading';
  });
  if (!translation) return null;
  return (
    <Indicator
      translation={translation}
      state={downloads.get(translation)!}
      className={className}
    />
  );
}

function Indicator({
  translation,
  state,
  className,
}: {
  translation: TranslationId;
  state: DownloadState;
  className?: string;
}) {
  const shown = useAfter(SHOW_AFTER_MS);
  if (!shown) return null;
  const { done, total } = state.status === 'downloading' ? state : { done: 0, total: 0 };
  const label = total
    ? `Downloading the ${TRANSLATION_NAMES[translation]}: ${done} of ${total} books`
    : `Starting to download the ${TRANSLATION_NAMES[translation]}`;
  return (
    <Link
      to="/settings"
      aria-label={label}
      title={label}
      data-slot="bible-download"
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground tabular-nums outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11',
        className,
      )}
    >
      <ProgressRing fraction={total ? done / total : 0} spinning={!total} />
      {/* "Bible" only where there's room, and on the narrowest phones the ring alone: the top bar
          keeps the screen's title whole. */}
      <span aria-hidden className="max-[379px]:hidden">
        <span className="hidden lg:inline">Bible </span>
        {total ? `${done}/${total}` : <span className="lg:hidden">…</span>}
      </span>
    </Link>
  );
}

/** A small ring filling clockwise; while the size isn't known yet, a quarter that turns. */
function ProgressRing({ fraction, spinning }: { fraction: number; spinning: boolean }) {
  const r = 6;
  const circumference = 2 * Math.PI * r;
  const shown = spinning ? 0.25 : fraction;
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={cn(
        'size-4 shrink-0 -rotate-90',
        spinning && 'animate-spin motion-reduce:animate-none',
      )}
    >
      <circle cx="8" cy="8" r={r} fill="none" strokeWidth="2" className="stroke-muted" />
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - shown)}
        className="stroke-primary transition-[stroke-dashoffset] duration-300"
      />
    </svg>
  );
}
