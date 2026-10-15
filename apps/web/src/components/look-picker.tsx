import type { UserSettings } from '@lamp/domain';
import { LOOKS, resolveMode } from '@lamp/ui/themes/presets';
import { Check } from 'lucide-react';
import { updateSettings } from '@/data/actions/settings.ts';
import { useLookState } from '@/lib/looks.ts';
import { usePrefersDark } from '@/lib/theme.ts';

/**
 * The looks as a radio group of cards, in the theme sheet and the first-run welcome. Classic is
 * drawn live in the chosen preset; a downloaded look by a picture of it, since its stylesheet
 * isn't here until it's chosen. A choice applies at once, once its stylesheet has arrived. Given
 * the settings its screen has read, so it draws with the rest of the screen, not a moment later.
 */
export function LookPicker({ settings }: { settings: UserSettings }) {
  const prefersDark = usePrefersDark();
  const lookState = useLookState();
  const mode = resolveMode(settings.colorMode, prefersDark);
  const chosen = LOOKS.find((l) => l.id === settings.look);

  return (
    <div className="flex flex-col gap-2">
      <fieldset>
        <legend className="sr-only">Look</legend>
        <div className="grid grid-cols-2 gap-3">
          {LOOKS.map((look) => (
            <label
              key={look.id}
              className="relative flex cursor-pointer flex-col gap-3 rounded-xl border bg-card p-3 text-card-foreground has-checked:border-primary has-checked:ring-2 has-checked:ring-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <input
                type="radio"
                name="theme-look"
                value={look.id}
                checked={settings.look === look.id}
                onChange={() => void updateSettings({ look: look.id })}
                className="absolute inset-0 cursor-pointer appearance-none opacity-0"
                aria-label={look.name}
                aria-describedby={`look-${look.id}-description`}
              />
              {look.id === 'classic' ? (
                <span
                  aria-hidden
                  data-theme={settings.themePreset}
                  // `light` switches the preview back from a dark page (globals.css).
                  className={`${mode} flex aspect-[160/72] flex-col justify-center gap-2 rounded-lg bg-background px-3`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-serif text-lg text-foreground">Aa</span>
                    <span className="rounded-4xl bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                      Grace
                    </span>
                  </span>
                  <span className="h-2 w-3/4 rounded-full bg-muted" />
                </span>
              ) : (
                <img
                  src={`/looks/${look.id}-${mode}.svg`}
                  alt=""
                  width={160}
                  height={72}
                  className="w-full rounded-lg border"
                />
              )}
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{look.name}</span>
                {settings.look === look.id && <Check className="size-4 text-primary" aria-hidden />}
              </span>
              <span id={`look-${look.id}-description`} className="text-xs text-muted-foreground">
                {look.description}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <output className="text-sm text-muted-foreground empty:hidden">
        {chosen && lookState.status === 'loading' && `Downloading ${chosen.name}…`}
        {chosen &&
          lookState.status === 'failed' &&
          `${chosen.name} couldn’t be downloaded. It’s applied when you’re back online.`}
      </output>
    </div>
  );
}
