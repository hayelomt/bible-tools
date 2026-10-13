import { Switch } from '@lamp/ui/components/switch';
import { updateSettings } from '@/data/actions/settings.ts';

/** "Show verse text in notes" (wireframes/verses.md); applies at once and syncs. */
export function VersePreviewSetting({ value }: { value: boolean }) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="flex flex-col gap-0.5">
        Show verse text in notes
        <span className="text-sm text-muted-foreground">
          Each verse’s text appears under the paragraph that cites it.
        </span>
      </span>
      <Switch
        checked={value}
        onCheckedChange={(autoPreviewVerses) => void updateSettings({ autoPreviewVerses })}
      />
    </label>
  );
}
