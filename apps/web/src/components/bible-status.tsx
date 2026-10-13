import { Check } from 'lucide-react';
import { useBibleDownload } from '@/data/bible-download.ts';
import { formatBytes } from '@/data/storage.ts';

/** The WEB text's download, in settings (wireframes/shell.md "Bible download"). */
export function BibleStatus() {
  const download = useBibleDownload();
  const name = <p>World English Bible</p>;

  switch (download.status) {
    case 'complete':
      return (
        <div className="flex items-center justify-between gap-4">
          {name}
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {formatBytes(download.bytes)}
            <Check className="size-4 text-primary" aria-label="Downloaded" />
          </p>
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
    default: {
      const { done = 0, total = 0 } = download.status === 'downloading' ? download : {};
      return (
        <div className="flex flex-col gap-2">
          {name}
          <div className="flex items-center gap-3">
            <progress
              aria-label="Downloading the World English Bible"
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
  }
}
