import { Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useThemeSync } from '@/lib/theme.ts';
import { BottomNav } from './bottom-nav.tsx';
import { ScreenHeader } from './screen-header.tsx';
import { Sidebar } from './sidebar.tsx';
import { ShellSlots, useSlotRef } from './slots.tsx';
import { newLessonTarget } from '@/lib/new-lesson.ts';

/**
 * The frame around every screen (wireframes/shell.md): a top bar and a bottom bar under 1024 px,
 * a sidebar from 1024 px, and the screen in one column of at most 42 rem, with a side panel next to
 * it when the screen fills one.
 */
export function AppShell() {
  useShortcuts();
  useThemeSync();
  return (
    <ShellSlots>
      <div className="min-h-svh lg:flex">
        <Sidebar />
        <div className="flex min-w-0 flex-1 justify-center gap-8 lg:px-8">
          <div className="flex w-full min-w-0 flex-1 flex-col lg:max-w-2xl">
            <ScreenHeader />
            <main className="flex-1 px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:px-0 lg:pt-0 lg:pb-10">
              <Outlet />
            </main>
          </div>
          <PanelSlot />
        </div>
        <BottomNav />
      </div>
    </ShellSlots>
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

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
