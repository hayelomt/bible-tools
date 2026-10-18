import { Switch } from '@lamp/ui/components/switch';
import { updateSettings } from '@/data/actions/settings.ts';

/** "Offer verse chips when pasting" (F19, M9-09, wireframes/interop.md); applies at once and syncs. */
export function PasteChipsSetting({ value }: { value: boolean }) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="flex flex-col gap-0.5">
        Offer verse chips when pasting
        <span className="text-sm text-muted-foreground">
          Pasted references and verses can become chips with one tap.
        </span>
      </span>
      <Switch
        checked={value}
        onCheckedChange={(pasteChips) => void updateSettings({ pasteChips })}
      />
    </label>
  );
}
