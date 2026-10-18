import { Alert, AlertDescription, AlertTitle } from '@lamp/ui/components/alert';
import { Button, buttonVariants } from '@lamp/ui/components/button';
import { toast } from '@lamp/ui/components/sonner';
import { Link, useNavigate } from '@tanstack/react-router';
import { CircleAlert } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import {
  cancelImport,
  type ImportRun,
  onImportFinished,
  resetImport,
  startImport,
  useImportRun,
} from '@/import/run.ts';
import { useAfter } from '@/lib/use-after.ts';

const number = new Intl.NumberFormat('en');

/** What an import did, in the toast and in place (wireframes/interop.md "YouVersion import"). */
function resultLines(run: Extract<ImportRun, { status: 'done' }>): [string, string | null] {
  const { added, skipped } = run.result;
  if (added === 0) {
    return [`Nothing new: all ${number.format(skipped)} were already imported.`, null];
  }
  return [
    `Imported ${number.format(added)} into your inbox.`,
    skipped > 0
      ? `${number.format(skipped)} ${skipped === 1 ? 'was' : 'were'} already there and skipped.`
      : null,
  ];
}

/**
 * YouVersion highlights and notes (F21, M9-11, wireframes/interop.md "YouVersion import"), in
 * Settings → Import and from the Inbox's `⋯`: choose the export file, watch it import (it runs on
 * the device, offline too, and goes on while the user works elsewhere), then the result in place.
 */
export function YouVersionImport() {
  const run = useImportRun();
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const showReading = useAfter(300);

  if (run.status === 'reading' || run.status === 'running' || run.status === 'saving') {
    const done = run.status === 'running' ? run.done : run.status === 'saving' ? run.total : 0;
    const total = run.status === 'reading' ? 0 : run.total;
    return (
      <div className="flex flex-col gap-2">
        <p id={id}>Importing from YouVersion…</p>
        {run.status === 'reading' ? (
          showReading && <p className="text-sm text-muted-foreground">Reading the file…</p>
        ) : (
          <div className="flex items-center gap-3">
            <progress
              aria-labelledby={id}
              max={total || 1}
              value={done}
              className="h-1.5 flex-1 appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-webkit-progress-value]:transition-[width]"
            />
            <p className="text-sm text-muted-foreground tabular-nums">
              {number.format(done)} of {number.format(total)}
            </p>
          </div>
        )}
        <p className="text-sm text-muted-foreground">You can keep working meanwhile.</p>
        <Button
          variant="outline"
          className="self-start"
          disabled={run.status === 'saving'}
          onClick={cancelImport}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <div className="flex flex-col gap-0.5">
        <p>YouVersion highlights and notes</p>
        <p className="text-sm text-muted-foreground">
          Download your data from YouVersion, then choose the file here. It’s read on this device;
          nothing is uploaded.
        </p>
      </div>
      {run.status === 'failed' && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>
            {run.format ? 'This isn’t a YouVersion export Lamp can read.' : 'The import failed.'}
          </AlertTitle>
          <AlertDescription>
            {run.format
              ? 'Nothing was imported. Choose the file from YouVersion’s data download.'
              : 'Nothing was imported. Try again.'}
          </AlertDescription>
        </Alert>
      )}
      {run.status === 'done' && <Result run={run} />}
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        tabIndex={-1}
        aria-label="YouVersion export file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) startImport(file);
        }}
      />
      <Button
        variant="outline"
        onClick={() => {
          resetImport();
          input.current?.click();
        }}
      >
        Choose file…
      </Button>
    </div>
  );
}

function Result({ run }: { run: Extract<ImportRun, { status: 'done' }> }) {
  const [first, second] = resultLines(run);
  return (
    <output className="flex flex-col gap-1">
      <span>{first}</span>
      {second && <span className="text-sm text-muted-foreground">{second}</span>}
      {run.result.added > 0 && (
        <Link
          to="/inbox"
          className={buttonVariants({ variant: 'link', className: 'self-start px-0' })}
        >
          Open inbox ›
        </Link>
      )}
    </output>
  );
}

/** The import's result as a toast, wherever the user is when it finishes. In the shell. */
export function ImportToasts() {
  const navigate = useNavigate();
  useEffect(
    () =>
      onImportFinished((run) => {
        if (run.status === 'failed') {
          toast.error('The YouVersion import didn’t work. Nothing was imported.');
          return;
        }
        if (run.status !== 'done') return;
        const [first, second] = resultLines(run);
        toast(first, {
          description: second ?? undefined,
          duration: 10_000,
          ...(run.result.added > 0 && {
            action: { label: 'Open inbox', onClick: () => void navigate({ to: '/inbox' }) },
          }),
        });
      }),
    [navigate],
  );
  return null;
}
