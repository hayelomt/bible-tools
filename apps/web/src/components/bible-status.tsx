import { TRANSLATION_NAMES, TRANSLATIONS, type TranslationId } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import { Check } from 'lucide-react';
import { useEffect, useId } from 'react';
import { updateSettings } from '@/data/actions/settings.ts';
import { checkBible, downloadBible, removeBible, useBibleDownload } from '@/data/bible-download.ts';
import { formatBytes } from '@/data/storage.ts';
import { Segmented } from './segmented.tsx';

const LABELS = Object.fromEntries(TRANSLATIONS.map((t) => [t, t])) as Record<TranslationId, string>;

/**
 * The Bible in settings: the translation the app reads and new verses quote (a choice applies at
 * once and syncs; chips keep their own), and each translation's download (wireframes/shell.md
 * "Bible download"). The one picked downloads on its own; another one only when asked.
 */
export function BibleSettings({ value }: { value: TranslationId }) {
  const name = useId();
  return (
    <>
      <fieldset className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <legend className="float-left">Translation</legend>
        <Segmented
          name={name}
          options={TRANSLATIONS}
          labels={LABELS}
          value={value}
          onChange={(defaultTranslation) => void updateSettings({ defaultTranslation })}
        />
      </fieldset>
      {TRANSLATIONS.map((translation) => (
        <BibleStatus key={translation} translation={translation} active={translation === value} />
      ))}
    </>
  );
}

/** One translation's download. */
export function BibleStatus({
  translation,
  active,
}: {
  translation: TranslationId;
  active: boolean;
}) {
  const download = useBibleDownload(translation);
  const label = TRANSLATION_NAMES[translation];
  const name = <p>{label}</p>;

  useEffect(() => {
    void checkBible(translation);
  }, [translation]);

  switch (download.status) {
    case 'complete':
      return (
        <div className="flex items-center justify-between gap-4">
          {name}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {formatBytes(download.bytes)}
            <Check className="size-4 text-primary" aria-label="Downloaded" />
            {!active && (
              <Button
                variant="ghost"
                size="sm"
                className="pointer-coarse:min-h-11"
                aria-label={`Remove the ${label} from this device`}
                onClick={() => void removeBible(translation)}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      );
    case 'paused':
      return (
        <div className="flex flex-col gap-1">
          {name}
          <p className="text-sm text-muted-foreground">
            Download paused: no connection. It continues when you’re online.
          </p>
        </div>
      );
    case 'unavailable':
      return (
        <div className="flex flex-col gap-1">
          {name}
          <p className="text-sm text-muted-foreground">
            This browser can’t keep it for offline use; books load as they’re opened.
          </p>
        </div>
      );
    case 'none':
      // The active one starts on its own shortly after the app opens.
      if (active) return <Progress label={label} done={0} total={0} />;
      return (
        <div className="flex items-center justify-between gap-4">
          <span className="flex flex-col gap-0.5">
            {label}
            <span className="text-sm text-muted-foreground">
              Not downloaded. Download it to read it offline.
            </span>
          </span>
          <Button
            variant="outline"
            size="sm"
            className="pointer-coarse:min-h-11"
            aria-label={`Download the ${label}`}
            onClick={() => void downloadBible(translation)}
          >
            Download
          </Button>
        </div>
      );
    default: {
      const { done = 0, total = 0 } = download.status === 'downloading' ? download : {};
      return <Progress label={label} done={done} total={total} />;
    }
  }
}

function Progress({ label, done, total }: { label: string; done: number; total: number }) {
  return (
    <div className="flex flex-col gap-2">
      <p>{label}</p>
      <div className="flex items-center gap-3">
        <progress
          aria-label={`Downloading the ${label}`}
          max={total || 1}
          value={done}
          className="h-1.5 flex-1 appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-webkit-progress-value]:transition-[width]"
        />
        <p className="text-sm text-muted-foreground tabular-nums">
          {total ? `${done} of ${total} books` : 'Starting…'}
        </p>
      </div>
    </div>
  );
}
