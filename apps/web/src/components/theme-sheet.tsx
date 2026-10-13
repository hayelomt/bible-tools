import { Button } from '@lamp/ui/components/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@lamp/ui/components/sheet';
import { LOOKS, PRESETS, resolveMode } from '@lamp/ui/themes/presets';
import { Check, ChevronRight } from 'lucide-react';
import { LookPicker } from '@/components/look-picker.tsx';
import { ModeControl } from '@/components/mode-control.tsx';
import { updateSettings } from '@/data/actions/settings.ts';
import { useSettings } from '@/data/use-settings.ts';
import { usePrefersDark } from '@/lib/theme.ts';

/**
 * The Theme row in Settings, naming the current look (or preset, for Classic), and the bottom
 * sheet it opens (F16,
 * wireframes/shell.md "Theme picker"). The sheet is the same on a laptop, centred and no wider
 * than the column. It closes with Esc, a tap outside or ×; a choice applies at once.
 */
export function ThemeSheet() {
  const settings = useSettings();
  if (!settings) return null;
  const current =
    settings.look === 'classic'
      ? PRESETS.find((p) => p.id === settings.themePreset)
      : LOOKS.find((l) => l.id === settings.look);
  return (
    <Sheet>
      <SheetTrigger className="-mx-2 flex min-h-9 items-center justify-between gap-4 rounded-lg px-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11">
        Theme
        <span className="flex items-center gap-1 text-muted-foreground">
          {current?.name}
          <ChevronRight className="size-4" aria-hidden />
        </span>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        // Narrow and centred on a laptop; clear of the home indicator on a phone; fades only
        // when motion is reduced (UX-PATTERNS "Accessibility").
        className="mx-auto max-h-[85svh] w-full max-w-2xl gap-0 overflow-y-auto rounded-t-2xl border-x pb-[env(safe-area-inset-bottom)] motion-reduce:data-ending-style:translate-y-0 motion-reduce:data-starting-style:translate-y-0"
      >
        <div className="px-4 pt-4 pb-2">
          <SheetTitle className="text-lg">Theme</SheetTitle>
        </div>
        <div className="px-4 pb-6">
          <ThemePicker />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The looks, the mode control and, for Classic, the six presets. Each preset card is drawn in its
 * own preset in the current mode, so the choice is visible before it's made. A downloaded look
 * brings its own colours, so the presets are hidden with it.
 */
function ThemePicker() {
  const settings = useSettings();
  const prefersDark = usePrefersDark();
  if (!settings) return null;
  const mode = resolveMode(settings.colorMode, prefersDark);

  return (
    <div className="flex flex-col gap-6">
      <LookPicker />
      <ModeControl value={settings.colorMode} />
      {settings.look === 'classic' && <PresetPicker mode={mode} />}
    </div>
  );
}

function PresetPicker({ mode }: { mode: 'light' | 'dark' }) {
  const settings = useSettings();
  if (!settings) return null;
  return (
    <>
      <fieldset>
        <legend className="sr-only">Colours</legend>
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
    </>
  );
}
