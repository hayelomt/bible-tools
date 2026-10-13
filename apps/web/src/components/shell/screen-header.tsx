import { buttonVariants } from '@lamp/ui/components/button';
import { Link, useMatches } from '@tanstack/react-router';
import { ArrowLeft, Settings } from 'lucide-react';
import { useSlotRef } from './slots.tsx';
import { SyncStatus } from './sync-status.tsx';

/**
 * The screen's title, its one `h1`, from the deepest route's `staticData`, or from the screen
 * itself through `ScreenTitle` when it comes from data. On a phone it's the top
 * bar, with the sync status and settings on the four destinations and `←` on the screens below
 * them; on a laptop the sidebar has those, and the title heads the content column.
 */
export function ScreenHeader() {
  const { title, back } = useMatches().at(-1)?.staticData ?? {};
  const titleSlot = useSlotRef('title');
  const actionsSlot = useSlotRef('actions');

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background px-4 lg:static lg:h-auto lg:border-0 lg:bg-transparent lg:px-0 lg:pt-10 lg:pb-6">
      {back && (
        <Link
          to={back}
          aria-label="Back"
          data-slot="button"
          className={buttonVariants({ variant: 'ghost', size: 'icon', className: '-ml-2 lg:ml-0' })}
        >
          <ArrowLeft />
        </Link>
      )}
      <h1 className="min-w-0 flex-1 truncate text-lg font-semibold lg:text-2xl">
        {title}
        <span ref={titleSlot} className="contents" />
      </h1>
      <div ref={actionsSlot} className="flex items-center gap-1 empty:hidden" />
      {!back && (
        <div className="flex items-center gap-1 lg:hidden">
          <SyncStatus />
          <Link
            to="/settings"
            aria-label="Settings"
            data-slot="button"
            className={buttonVariants({ variant: 'ghost', size: 'icon' })}
          >
            <Settings />
          </Link>
        </div>
      )}
    </header>
  );
}
