import { DENSITY_OPTIONS, TEXT_SIZE_OPTIONS } from '@lamp/ui/themes/theme';
import { useId } from 'react';
import { setDisplay, useDisplay } from '@/lib/display.ts';
import { Segmented } from './segmented.tsx';

const DENSITY_LABELS = { compact: 'Compact', default: 'Default', roomy: 'Roomy' } as const;
const TEXT_SIZE_LABELS = { small: 'Small', default: 'Default', large: 'Large', larger: 'Larger' };

/**
 * Density and text size (wireframes/shell.md "Appearance"), for this device only; a choice
 * applies at once, with no Save.
 */
export function DisplayControl() {
  const display = useDisplay();
  const densityName = useId();
  const textSizeName = useId();
  return (
    <>
      <fieldset className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <legend className="float-left">Density</legend>
        <Segmented
          name={densityName}
          options={DENSITY_OPTIONS}
          labels={DENSITY_LABELS}
          value={display.density}
          onChange={(density) => setDisplay({ density })}
        />
      </fieldset>
      <fieldset className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <legend className="float-left">Text size</legend>
        <Segmented
          name={textSizeName}
          options={TEXT_SIZE_OPTIONS}
          labels={TEXT_SIZE_LABELS}
          value={display.textSize}
          onChange={(textSize) => setDisplay({ textSize })}
        />
      </fieldset>
      <p className="text-sm text-muted-foreground">
        Density and text size are for this device only.
      </p>
    </>
  );
}
