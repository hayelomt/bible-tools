import { cn } from 'cn';

/**
 * Where the notes are (UX-PATTERNS "Offline and sync"). A guest's notes are only on this device,
 * which is said plainly, with no call to action. M3-09 adds the sync states and the panel.
 */
export function SyncStatus({ className }: { className?: string }) {
  return <output className={cn('text-sm text-muted-foreground', className)}>On this device</output>;
}
