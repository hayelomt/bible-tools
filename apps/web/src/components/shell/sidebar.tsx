import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Settings } from 'lucide-react';
import { allGroups } from '@/data/groups.ts';
import { allSeries } from '@/data/queries.ts';
import { NavCount } from './nav-count.tsx';
import { NAV_ITEMS } from './nav-items.ts';
import { BibleDownloadIndicator } from './bible-download-indicator.tsx';
import { SyncStatus } from './sync-status.tsx';

const itemClass =
  'flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11 aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground';

/** The laptop's sidebar, from 1024 px (wireframes/shell.md). */
export function Sidebar() {
  const series = useLiveQuery(() => allSeries(), []);
  const groups = useLiveQuery(() => allGroups(), []);

  return (
    <aside
      data-slot="sidebar"
      className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col gap-6 border-r bg-card p-4 lg:flex"
    >
      <Link to="/" data-slot="brand" className="px-3 text-lg font-semibold">
        Lamp
      </Link>
      <nav aria-label="Main">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link to={to} activeOptions={{ exact: to === '/' }} className={itemClass}>
                <Icon className="size-4" aria-hidden />
                {label}
                <NavCount to={to} className="ml-auto" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {series && series.length > 0 && (
        <section aria-labelledby="sidebar-series" className="flex min-h-0 flex-col gap-1">
          <h2 id="sidebar-series" className="px-3 text-xs font-medium text-muted-foreground">
            Series
          </h2>
          <ul className="flex flex-col gap-1 overflow-y-auto">
            {series.map((s) => (
              <li key={s.id}>
                <Link to="/series/$seriesId" params={{ seriesId: s.id }} className={itemClass}>
                  <span className="truncate">{s.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {groups && groups.length > 0 && (
        <section aria-labelledby="sidebar-groups" className="flex min-h-0 flex-col gap-1">
          <h2 id="sidebar-groups" className="px-3 text-xs font-medium text-muted-foreground">
            Groups
          </h2>
          <ul className="flex flex-col gap-1 overflow-y-auto">
            {groups.map((g) => (
              <li key={g.id}>
                <Link to="/groups/$groupId" params={{ groupId: g.id }} className={itemClass}>
                  <span className="truncate">{g.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="mt-auto flex flex-col gap-1">
        <BibleDownloadIndicator className="px-3 py-1.5" />
        <SyncStatus className="px-3 py-1.5" />
        <Link to="/settings" className={itemClass}>
          <Settings className="size-4" aria-hidden />
          Settings
        </Link>
      </div>
    </aside>
  );
}
