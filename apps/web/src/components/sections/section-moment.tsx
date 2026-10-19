import { Button } from '@lamp/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@lamp/ui/components/dialog';
import { Input } from '@lamp/ui/components/input';
import { Label } from '@lamp/ui/components/label';
import { Play } from 'lucide-react';
import { useId, useState } from 'react';
import { setSectionMoment } from '@/data/actions/source.ts';
import { momentUrl } from '@/lib/media-time.ts';
import { runWrite } from '@/lib/run-write.ts';
import { offsetLabel, offsetSeconds, pageLabel, parseMoment } from '@/lib/source-time.ts';

interface Moment {
  sourceAt: string | null;
  sourcePage: string | null;
}

/** What "Time or page…" starts with: "09:45", "p. 112", or nothing. */
function typedOf(moment: Moment, startedAt: string | null): string {
  if (moment.sourceAt && startedAt) return offsetLabel(moment.sourceAt, startedAt);
  return moment.sourcePage ? pageLabel(moment.sourcePage) : '';
}

/**
 * A section's time or page at the start of its first line (wireframes/sermon.md "Section
 * timestamps and pages", M11-07): `▶ 09:45` opens the recording there where the link can jump
 * (YouTube, Vimeo, an audio file), and at the start, saying so, where it can't. Without a link the
 * time is plain text, as a page always is.
 */
export function SectionMoment({
  moment,
  startedAt,
  url,
}: {
  moment: Moment;
  startedAt: string | null;
  url: string | null;
}) {
  const plain = 'float-left mt-[3px] mr-2 text-sm text-muted-foreground tabular-nums';
  if (moment.sourceAt && startedAt) {
    const label = offsetLabel(moment.sourceAt, startedAt);
    if (!url) {
      return (
        <span className={plain}>
          {label}
          <span className="sr-only">: </span>
        </span>
      );
    }
    const at = momentUrl(url, offsetSeconds(moment.sourceAt, startedAt));
    return (
      <a
        href={at ?? url}
        target="_blank"
        rel="noopener noreferrer"
        title={at ? undefined : 'Opens at the start; this site can’t jump to a time.'}
        aria-label={
          at
            ? `Open the recording at ${label}`
            : `${label}: open the recording at the start; this site can’t jump to a time`
        }
        // Above the editor's text, which is positioned and would take the tap otherwise.
        className={`${plain} relative z-[1] -my-0.5 -ml-1 flex items-center gap-0.5 rounded-md px-1 py-0.5 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50`}
      >
        <Play aria-hidden className="size-3 fill-current" />
        {label}
      </a>
    );
  }
  if (moment.sourcePage) {
    return (
      <span className={plain}>
        {pageLabel(moment.sourcePage)}
        <span className="sr-only">: </span>
      </span>
    );
  }
  return null;
}

/**
 * The section menu's "Time or page…": a field that takes "9:45" (into the recording) or
 * "p. 112", and Remove.
 */
export function MomentDialog({
  sectionId,
  moment,
  startedAt,
  open,
  onOpenChange,
}: {
  sectionId: string;
  moment: Moment;
  startedAt: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <MomentForm
            sectionId={sectionId}
            initial={typedOf(moment, startedAt)}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MomentForm({
  sectionId,
  initial,
  onDone,
}: {
  sectionId: string;
  initial: string;
  onDone: () => void;
}) {
  const [typed, setTyped] = useState(initial);
  const [wrong, setWrong] = useState(false);
  const id = useId();
  const errorId = useId();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const moment = typed.trim() ? parseMoment(typed) : null;
        if (typed.trim() && !moment) return setWrong(true);
        runWrite(setSectionMoment(sectionId, moment), 'the time or page');
        onDone();
      }}
    >
      <DialogHeader>
        <DialogTitle>Time or page</DialogTitle>
        <DialogDescription>
          Where this section is in the lesson’s source: a time into the recording, or a page.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>Time or page</Label>
        <Input
          id={id}
          value={typed}
          placeholder="9:45 or p. 112"
          autoComplete="off"
          aria-invalid={wrong || undefined}
          aria-describedby={wrong ? errorId : undefined}
          onChange={(event) => {
            setTyped(event.target.value);
            setWrong(false);
          }}
        />
        {wrong && (
          <p id={errorId} className="text-sm text-destructive">
            Type a time, like 9:45, or a page, like p. 112.
          </p>
        )}
      </div>
      <DialogFooter>
        {initial && (
          <Button
            type="button"
            variant="outline"
            className="sm:mr-auto"
            onClick={() => {
              runWrite(setSectionMoment(sectionId, null), 'the time or page');
              onDone();
            }}
          >
            Remove
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Save</Button>
      </DialogFooter>
    </form>
  );
}
