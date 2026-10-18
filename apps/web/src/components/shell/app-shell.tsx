import { Toaster } from '@lamp/ui/components/sonner';
import { Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { OtherAccountDialog } from '@/components/account/other-account-dialog.tsx';
import { ReviewCountProvider } from '@/components/review/review-count.tsx';
import { useMediaQuery } from '@/lib/use-media-query.ts';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { useThemeSync } from '@/lib/theme.ts';
import { BottomNav } from './bottom-nav.tsx';
import { InstallPrompt } from './install-prompt.tsx';
import { ScreenHeader } from './screen-header.tsx';
import { SelectionBarOpenProvider } from './selection-bar-open.tsx';
import { Sidebar } from './sidebar.tsx';
import { ShellSlots, useSlotRef } from './slots.tsx';
import { ImportToasts } from '@/components/import/youversion-import.tsx';
import { UpdatePrompt } from './update-prompt.tsx';
import { isTyping } from '@/lib/is-typing.ts';
import { newLessonTarget } from '@/lib/new-lesson.ts';
import { useSyncAccount } from '@/sync/sync.ts';

/** The width from which the sidebar replaces the top and bottom bars (Tailwind's `lg`). */
export const LAPTOP = '(min-width: 1024px)';

/**
 * The frame around every screen (wireframes/shell.md): a top bar and a bottom bar under 1024 px,
 * a sidebar from 1024 px, and the screen in one column of at most 42 rem, with a side panel next to
 * it when the screen fills one. Only the bars for the current width are mounted, so their live
 * reads (sync status, series, review count) run once.
 */
export function AppShell() {
  useShortcuts();
  useThemeSync();
  useSyncAccount();
  const laptop = useMediaQuery(LAPTOP);
  const [selectionBar, setSelectionBar] = useState(false);
  return (
    <ReviewCountProvider>
      <SelectionBarOpenProvider setOpen={setSelectionBar}>
        <ShellSlots>
          <div className="min-h-svh lg:flex">
            {laptop && <Sidebar />}
            <div className="flex min-w-0 flex-1 justify-center gap-8 lg:px-8">
              <div className="flex w-full min-w-0 flex-1 flex-col lg:max-w-2xl">
                <ScreenHeader laptop={laptop} />
                <main className={MAIN_CLASS}>
                  <Outlet />
                </main>
              </div>
              <PanelSlot />
            </div>
            {!laptop && <BottomNav hidden={selectionBar} />}
          </div>
          <AppToaster />
          <UpdatePrompt />
          <ImportToasts />
          <InstallPrompt />
          <OtherAccountDialog />
        </ShellSlots>
      </SelectionBarOpenProvider>
    </ReviewCountProvider>
  );
}

const MAIN_CLASS =
  'flex-1 px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:px-0 lg:pt-0 lg:pb-10';

/**
 * The shell's empty frame, drawn while the device is set up, as index.html draws it before the
 * app's script runs: the page keeps its shape from the first paint to the first screen.
 */
export function ShellFrame() {
  return (
    <div className="min-h-svh lg:flex" aria-busy="true">
      <aside
        data-slot="sidebar"
        className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col gap-6 border-r bg-card p-4 lg:flex"
      />
      <div className="flex min-w-0 flex-1 justify-center gap-8 lg:px-8">
        <div className="flex w-full min-w-0 flex-1 flex-col lg:max-w-2xl">
          <header
            data-slot="screen-header"
            className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background px-4 lg:hidden"
          />
          <main className={MAIN_CLASS}>
            <ScreenSkeleton />
          </main>
        </div>
      </div>
      <nav
        data-slot="bottom-nav"
        className="fixed inset-x-0 bottom-0 z-10 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid h-14 grid-cols-4" />
      </nav>
    </div>
  );
}

/**
 * Toasts (UX-PATTERNS "Saving and feedback"): one at a time, above the bottom bar on a phone and
 * bottom-right on a laptop. Sonner's list is a polite live region.
 */
function AppToaster() {
  const laptop = useMediaQuery(LAPTOP);
  const aboveBar = { bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' };
  return (
    <Toaster
      position={laptop ? 'bottom-right' : 'bottom-center'}
      visibleToasts={1}
      offset={laptop ? 24 : aboveBar}
      mobileOffset={{ ...aboveBar, left: 16, right: 16 }}
    />
  );
}

function PanelSlot() {
  return <div ref={useSlotRef('panel')} className="w-64 shrink-0 pt-10 empty:hidden" />;
}

/**
 * Laptop shortcuts (UX-PATTERNS "Touch, keyboard and input"): `/` opens search and `n` starts a
 * new lesson, from anywhere except a text field.
 */
function useShortcuts() {
  const navigate = useNavigate();
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target)) return;
      if (event.key === '/') {
        event.preventDefault();
        void navigate({ to: '/search' });
      } else if (event.key === 'n') {
        event.preventDefault();
        void navigate(newLessonTarget());
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navigate]);
}
