import { Button } from '@lamp/ui/components/button';
import { ArrowRight } from 'lucide-react';
import { useId } from 'react';
import { LookPicker } from '@/components/look-picker.tsx';
import { ModeControl } from '@/components/mode-control.tsx';
import { useSettings } from '@/data/use-settings.ts';
import { finishWelcome } from '@/lib/welcome.ts';

/**
 * The first screen on a new device (wireframes/lessons.md "First run"): pick a look and a mode,
 * both already set to the defaults, so Continue alone is enough. Either can change later in
 * Settings → Theme.
 */
export function Welcome() {
  const settings = useSettings();
  const headingId = useId();
  if (!settings) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-6 py-4">
      <div className="flex flex-col gap-2">
        <h2 id={headingId} data-slot="welcome-title" className="font-serif text-2xl">
          Welcome to Lamp
        </h2>
        <p className="text-muted-foreground">
          Choose how your notes look. You can change it any time in Settings.
        </p>
      </div>
      <LookPicker />
      <ModeControl value={settings.colorMode} />
      <div className="flex flex-col *:w-full">
        <Button size="lg" onClick={finishWelcome}>
          Continue
          <ArrowRight aria-hidden />
        </Button>
      </div>
    </section>
  );
}
