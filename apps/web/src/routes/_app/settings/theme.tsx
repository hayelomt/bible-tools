import { Button } from '@lamp/ui/components/button';
import { PRESETS, resolveMode } from '@lamp/ui/themes/presets';
import { createFileRoute } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { ModeControl } from '@/components/mode-control.tsx';
import { updateSettings } from '@/data/actions/settings.ts';
import { useSettings } from '@/data/use-settings.ts';
import { usePrefersDark } from '@/lib/theme.ts';

export const Route = createFileRoute('/_app/settings/theme')({
  staticData: { title: 'Theme', back: '/settings' },
  component: ThemePicker,
});

/**
 * The theme picker (F16, wireframes/shell.md "Theme picker"). Each card is drawn in its own preset
 * in the current mode, so the choice is visible before it's made; a tap applies it at once.
 */
function ThemePicker() {
  const settings = useSettings();
  const prefersDark = usePrefersDark();
  if (!settings) return null;
  const mode = resolveMode(settings.colorMode, prefersDark);

  return (
    <div className="flex flex-col gap-6">
      <ModeControl value={settings.colorMode} />
      <fieldset>
        <legend className="sr-only">Theme</legend>
        <div className="grid grid-cols-2 gap-3">
          {PRESETS.map((preset) => (
            <label
              key={preset.id}
              data-theme={preset.id}
              // `light` switches a card back from a dark page (the dark variant in globals.css).
              className={`${mode} relative flex cursor-pointer flex-col gap-3 rounded-xl border bg-background p-3 text-foreground has-checked:border-primary has-checked:ring-2 has-checked:ring-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50`}
            >
              <input
                type="radio"
                name="theme-preset"
                value={preset.id}
                checked={settings.themePreset === preset.id}
                onChange={() => void updateSettings({ themePreset: preset.id })}
                className="absolute inset-0 cursor-pointer appearance-none opacity-0"
                aria-label={preset.name}
                aria-describedby={`${preset.id}-description`}
              />
              <span aria-hidden className="flex items-center gap-2">
                <span className="font-serif text-lg">Aa</span>
                <span className="rounded-4xl bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                  Grace
                </span>
                <span className="h-2 flex-1 rounded-full bg-muted" />
              </span>
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{preset.name}</span>
                {settings.themePreset === preset.id && (
                  <Check className="size-4 text-primary" aria-hidden />
                )}
              </span>
              <span id={`${preset.id}-description`} className="text-xs text-muted-foreground">
                {preset.description}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {settings.themePreset === 'midnight' && mode === 'light' && (
        <div className="flex flex-col items-start gap-2">
          <p>Midnight is made for dark mode.</p>
          <Button variant="outline" onClick={() => void updateSettings({ colorMode: 'dark' })}>
            Use dark mode
          </Button>
        </div>
      )}
    </div>
  );
}
