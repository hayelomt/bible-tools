import { createFileRoute } from '@tanstack/react-router';
import { ApiStatus } from '@/components/api-status.tsx';
import { SettingsSection } from '@/components/settings-section.tsx';
import packageJson from '../../../../package.json' with { type: 'json' };

const SOURCE_URL = 'https://github.com/hayelomt/bible-tools';

export const Route = createFileRoute('/_app/settings/')({
  staticData: { title: 'Settings', back: '/' },
  component: Settings,
});

/** One scrolling page in sections (wireframes/shell.md "Settings"). */
function Settings() {
  return (
    <div className="flex flex-col gap-8">
      <SettingsSection title="Account">
        {/* M3-05 adds sign-up and sign-in here; a guest is never asked before then. */}
        <p>Your notes are only on this device.</p>
      </SettingsSection>
      <SettingsSection title="About">
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
      </SettingsSection>
    </div>
  );
}
