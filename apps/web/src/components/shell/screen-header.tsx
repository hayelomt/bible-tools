import { buttonVariants } from '@lamp/ui/components/button';
import { Link, useMatches } from '@tanstack/react-router';
import { ArrowLeft, Settings } from 'lucide-react';
import { BibleDownloadIndicator } from './bible-download-indicator.tsx';
import { useSlotRef } from './slots.tsx';
import { SyncStatus } from './sync-status.tsx';

/**
 * The screen's title, its one `h1`, from the deepest route's `staticData`, or from the screen
 * itself through `ScreenTitle` when it comes from data. On a phone it's the top bar, with the
 * Bible download (while it runs), the sync status and settings on the four destinations and `←`
 * on the screens below them; on a laptop the sidebar has those (and they aren't mounted here),
 * and the title heads the content column.
 */
export function ScreenHeader({ laptop }: { laptop: boolean }) {
  const { title, back } = useMatches().at(-1)?.staticData ?? {};
  const titleSlot = useSlotRef('title');
  const actionsSlot = useSlotRef('actions');

  return (
    <header
      data-slot="screen-header"
      className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background px-4 lg:static lg:h-auto lg:border-0 lg:bg-transparent lg:px-0 lg:pt-10 lg:pb-6"
    >
      {back && (
        <Link
          // The router resolves `../..` as it does `..`, though its types list `..` alone.
          to={back as '..'}
          aria-label="Back"
          data-slot="button"
          className={buttonVariants({ variant: 'ghost', size: 'icon', className: '-ml-2 lg:ml-0' })}
        >
          <ArrowLeft />
        </Link>
      )}
      <h1
        data-slot="screen-title"
        className="min-w-0 flex-1 truncate text-lg font-semibold lg:text-2xl"
      >
        {title}
        <span ref={titleSlot} className="contents" />
      </h1>
      <div ref={actionsSlot} className="flex items-center gap-1 empty:hidden" />
      {!back && !laptop && (
        <div className="flex min-w-0 items-center gap-1 lg:hidden">
          <BibleDownloadIndicator />
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
