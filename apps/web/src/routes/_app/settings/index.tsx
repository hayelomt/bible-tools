import { createFileRoute, Link } from '@tanstack/react-router';
import { linkClass } from '@/components/account/fields.tsx';
import { AccountSection } from '@/components/account/account-section.tsx';
import { DeleteAccount } from '@/components/account/delete-account.tsx';
import { ApiStatus } from '@/components/api-status.tsx';
import { DigestSetting } from '@/components/groups/digest-setting.tsx';
import { BibleSettings } from '@/components/bible-status.tsx';
import { YouVersionImport } from '@/components/import/youversion-import.tsx';
import { ModeControl } from '@/components/mode-control.tsx';
import { PageSection } from '@/components/page-section.tsx';
import { PasteChipsSetting } from '@/components/paste-chips-setting.tsx';
import { ReminderSetting } from '@/components/review/reminder-setting.tsx';
import { ResurfacingSetting } from '@/components/review/resurfacing-setting.tsx';
import { ReviewWindowSetting } from '@/components/review/review-window-setting.tsx';
import { RemoveNotes } from '@/components/remove-notes.tsx';
import { StorageStatus } from '@/components/storage-status.tsx';
import { VersePreviewSetting } from '@/components/verse-preview-setting.tsx';
import { useSettings } from '@/data/use-settings.ts';
import { useAccount } from '@/lib/account.ts';
import packageJson from '../../../../package.json' with { type: 'json' };

const SOURCE_URL = 'https://github.com/hayelomt/bible-tools';

export const Route = createFileRoute('/_app/settings/')({
  staticData: { title: 'Settings', back: '/' },
  component: Settings,
});

/** One scrolling page in sections (wireframes/shell.md "Settings"). */
function Settings() {
  const settings = useSettings();
  const account = useAccount().data;
  return (
    <div className="flex flex-col gap-8">
      <AccountSection />
      {settings && (
        <PageSection title="Appearance">
          <ModeControl value={settings.colorMode} />
        </PageSection>
      )}
      <PageSection title="Bible">
        {settings && <BibleSettings value={settings.defaultTranslation} />}
        {settings && <VersePreviewSetting value={settings.autoPreviewVerses} />}
        <Link to="/settings/open-in" className={linkClass}>
          Open in other apps ›
        </Link>
      </PageSection>
      {settings && (
        <PageSection title="Editing">
          <PasteChipsSetting value={settings.pasteChips} />
          <Link to="/settings/templates" className={linkClass}>
            Templates ›
          </Link>
        </PageSection>
      )}
      {settings && (
        <PageSection title="Review">
          <ReviewWindowSetting value={settings.reviewWindowDays} />
          <ResurfacingSetting value={settings.resurfacing} />
          <ReminderSetting />
        </PageSection>
      )}
      {account && (
        <PageSection title="Groups">
          <DigestSetting account={account} />
        </PageSection>
      )}
      <PageSection title="Import">
        <YouVersionImport />
      </PageSection>
      <PageSection title="Storage">
        <StorageStatus />
        <RemoveNotes />
      </PageSection>
      <PageSection title="About">
        <p className="text-sm">
          Lamp {packageJson.version} · MIT licence ·{' '}
          <a className="text-primary underline-offset-4 hover:underline" href={SOURCE_URL}>
            Source
          </a>
        </p>
        <p className="text-sm">
          Bible text: the{' '}
          <a
            className="text-primary underline-offset-4 hover:underline"
            href="https://berean.bible/"
          >
            Berean Standard Bible
          </a>{' '}
          and the King James Version, both public domain
        </p>
        <Link to="/guide" className={linkClass}>
          User guide ›
        </Link>
        <Link to="/privacy" className={linkClass}>
          Privacy ›
        </Link>
        <ApiStatus />
      </PageSection>
      {/* At the very end, in the destructive colour (wireframes/shell.md). */}
      {account && <DeleteAccount email={account.email} />}
    </div>
  );
}
