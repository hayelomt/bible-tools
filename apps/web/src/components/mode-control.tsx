import { COLOR_MODES, type UserSettings } from '@lamp/domain';
import { updateSettings } from '@/data/actions/settings.ts';

const LABELS = { light: 'Light', dark: 'Dark', system: 'System' } as const;

/**
 * Light / dark / system as a segmented control (wireframes/shell.md). Native radios, so arrow
 * keys move between them; a choice applies at once, with no Save.
 */
export function ModeControl({ value }: { value: UserSettings['colorMode'] }) {
  return (
    <fieldset className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <legend className="float-left">Mode</legend>
      <div className="flex rounded-lg border border-input p-0.5">
        {COLOR_MODES.map((mode) => (
          <label
            key={mode}
            className="relative flex h-7 cursor-pointer items-center rounded-md px-3 text-sm text-muted-foreground has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50 pointer-coarse:min-h-11"
          >
            <input
              type="radio"
              name="color-mode"
              value={mode}
              checked={value === mode}
              onChange={() => void updateSettings({ colorMode: mode })}
              className="absolute inset-0 cursor-pointer appearance-none opacity-0"
            />
            {LABELS[mode]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
