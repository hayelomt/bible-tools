import { COLOR_MODES, type UserSettings } from '@lamp/domain';
import { useId } from 'react';
import { updateSettings } from '@/data/actions/settings.ts';
import { Segmented } from './segmented.tsx';

const LABELS = { light: 'Light', dark: 'Dark', system: 'Auto' } as const;

/**
 * Light / dark / auto (wireframes/shell.md); a choice applies at once, with no Save. Auto follows
 * the device. Settings and the welcome screen both show it, so each gets its own radio group name.
 */
export function ModeControl({ value }: { value: UserSettings['colorMode'] }) {
  const name = useId();
  return (
    <fieldset className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <legend className="float-left">Mode</legend>
      <Segmented
        name={name}
        options={COLOR_MODES}
        labels={LABELS}
        value={value}
        onChange={(colorMode) => void updateSettings({ colorMode })}
      />
    </fieldset>
  );
}
