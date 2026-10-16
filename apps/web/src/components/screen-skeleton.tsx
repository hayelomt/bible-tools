import { cn } from 'cn';

/**
 * A screen's shape while its notes are read from the device: a few muted rows instead of a blank
 * page, so the layout doesn't jump when they arrive. Silent for screen readers; the region it
 * fills is marked busy.
 */
export function ScreenSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden className={cn('flex flex-col gap-3 py-2', className)}>
      <div className="h-6 w-2/5 animate-pulse rounded-md bg-muted" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-muted/70" />
      ))}
    </div>
  );
}
