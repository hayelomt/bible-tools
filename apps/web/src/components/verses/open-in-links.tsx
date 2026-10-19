import { OPEN_IN_TARGETS, openInUrl, shownTargets, type VerseRef } from '@lamp/domain';
import { ArrowUpRight } from 'lucide-react';
import { useId } from 'react';
import { useActiveTranslation } from '@/data/translation.ts';
import { useSettings } from '@/data/use-settings.ts';
import { useOpenInTable } from '@/open-in/table.ts';

/**
 * "Open in…" (F20, M9-10, wireframes/interop.md): the chip's passage in each target the user
 * shows, in their order, in a new tab or the installed app. Lamp keeps nothing from the target.
 * With every target hidden, nothing shows.
 */
export function OpenInLinks({ chip }: { chip: VerseRef }) {
  const id = useId();
  const table = useOpenInTable();
  const keys = useSettings()?.openInTargets ?? OPEN_IN_TARGETS;
  const active = useActiveTranslation();
  const targets = shownTargets(table, keys);
  if (targets.length === 0) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1">
      <h3 id={id} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Open in
      </h3>
      <ul className="-mx-2 flex flex-col">
        {targets.map((target) => (
          <li key={target.key}>
            <a
              href={openInUrl(target, chip, active)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-lg px-2 py-2 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
            >
              {target.name}
              <ArrowUpRight aria-hidden className="size-4 text-muted-foreground" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
