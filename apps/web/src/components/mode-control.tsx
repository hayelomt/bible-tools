import { COLOR_MODES, type UserSettings } from '@lamp/domain';
import { updateSettings } from '@/data/actions/settings.ts';
import { Segmented } from './segmented.tsx';

const LABELS = { light: 'Light', dark: 'Dark', system: 'System' } as const;

/** Light / dark / system (wireframes/shell.md); a choice applies at once, with no Save. */
export function ModeControl({ value }: { value: UserSettings['colorMode'] }) {
  return (
    <fieldset className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <legend className="float-left">Mode</legend>
      <Segmented
        name="color-mode"
        options={COLOR_MODES}
        labels={LABELS}
        value={value}
        onChange={(colorMode) => void updateSettings({ colorMode })}
      />
    </fieldset>
  );
}
