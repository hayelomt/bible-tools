import { PRESETS } from '@lamp/ui/themes/presets';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { ApiStatus } from '@/components/api-status.tsx';
import { ModeControl } from '@/components/mode-control.tsx';
import { PageSection } from '@/components/page-section.tsx';
import { useSettings } from '@/data/use-settings.ts';
import packageJson from '../../../../package.json' with { type: 'json' };

const SOURCE_URL = 'https://github.com/hayelomt/bible-tools';

export const Route = createFileRoute('/_app/settings/')({
  staticData: { title: 'Settings', back: '/' },
  component: Settings,
});

/** One scrolling page in sections (wireframes/shell.md "Settings"). */
function Settings() {
  const settings = useSettings();
  const preset = PRESETS.find((p) => p.id === settings?.themePreset);
  return (
    <div className="flex flex-col gap-8">
      <PageSection title="Account">
        {/* M3-05 adds sign-up and sign-in here; a guest is never asked before then. */}
        <p>Your notes are only on this device.</p>
      </PageSection>
      {settings && (
        <PageSection title="Appearance">
          <Link
            to="/settings/theme"
            className="-mx-2 flex min-h-9 items-center justify-between gap-4 rounded-lg px-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
          >
            Theme
            <span className="flex items-center gap-1 text-muted-foreground">
              {preset?.name}
              <ChevronRight className="size-4" aria-hidden />
            </span>
          </Link>
          <ModeControl value={settings.colorMode} />
        </PageSection>
      )}
      <PageSection title="About">
        <p className="text-sm">
          Lamp {packageJson.version} · MIT licence ·{' '}
          <a className="text-primary underline-offset-4 hover:underline" href={SOURCE_URL}>
            Source
          </a>
        </p>
        <p className="text-sm">
          Bible text: the World English Bible, public domain, from{' '}
          <a
            className="text-primary underline-offset-4 hover:underline"
            href="https://ebible.org/web/"
          >
            eBible.org
          </a>
        </p>
        <ApiStatus />
      </PageSection>
    </div>
  );
}
