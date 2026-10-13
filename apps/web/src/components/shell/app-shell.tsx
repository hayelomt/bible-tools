import { Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useThemeSync } from '@/lib/theme.ts';
import { BottomNav } from './bottom-nav.tsx';
import { ScreenHeader } from './screen-header.tsx';
import { Sidebar } from './sidebar.tsx';

/**
 * The frame around every screen (wireframes/shell.md): a top bar and a bottom bar under 1024 px,
 * a sidebar from 1024 px, and the screen in one column of at most 42 rem.
 */
export function AppShell() {
  useShortcuts();
  useThemeSync();
  return (
    <div className="min-h-svh lg:flex">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col lg:px-8">
        <div className="mx-auto flex w-full flex-1 flex-col lg:max-w-2xl">
          <ScreenHeader />
          <main className="flex-1 px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:px-0 lg:pt-0 lg:pb-10">
            <Outlet />
          </main>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}

/** `/` opens search from anywhere except a text field (UX-PATTERNS "Touch, keyboard and input"). */
function useShortcuts() {
  const navigate = useNavigate();
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTyping(event.target)) return;
      if (event.key === '/') {
        event.preventDefault();
        void navigate({ to: '/search' });
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navigate]);
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
