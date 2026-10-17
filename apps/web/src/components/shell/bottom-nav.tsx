import { Link } from '@tanstack/react-router';
import { useKeyboardInset } from '@/lib/use-keyboard.ts';
import { NavCount } from './nav-count.tsx';
import { NAV_ITEMS } from './nav-items.ts';

/**
 * The phone's bottom bar, under 1024 px (wireframes/shell.md). It hides while the on-screen
 * keyboard is open, so the editing toolbar can sit on the keyboard (UX-PATTERNS "Phone keyboard").
 */
export function BottomNav({ hidden = false }: { hidden?: boolean }) {
  const keyboard = useKeyboardInset();
  if (hidden || keyboard > 0) return null;
  return (
    <nav
      aria-label="Main"
      data-slot="bottom-nav"
      className="fixed inset-x-0 bottom-0 z-10 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid h-14 grid-cols-5">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              activeOptions={{ exact: to === '/' }}
              className="relative flex h-full flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:font-medium aria-[current=page]:text-foreground"
            >
              <Icon className="size-5" aria-hidden />
              {label}
              <NavCount to={to} className="absolute top-1.5 left-[calc(50%+0.5rem)]" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
