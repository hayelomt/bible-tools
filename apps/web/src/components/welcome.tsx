import { Button } from '@lamp/ui/components/button';
import { ArrowRight } from 'lucide-react';
import { useId } from 'react';
import { ModeControl } from '@/components/mode-control.tsx';
import { useSettings } from '@/data/use-settings.ts';
import { finishWelcome } from '@/lib/welcome.ts';

/**
 * The first screen on a new device (wireframes/lessons.md "First run"): pick a mode, already set
 * to Auto, so Continue alone is enough. It can change later in Settings → Appearance.
 */
export function Welcome() {
  const settings = useSettings();
  const headingId = useId();
  if (!settings) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-6 py-4">
      <div className="flex flex-col gap-2">
        <h2 id={headingId} data-slot="welcome-title" className="text-2xl">
          Welcome to Lamp
        </h2>
        <p className="text-muted-foreground">
          Choose light, dark, or Auto to follow your device. You can change it any time in Settings.
        </p>
      </div>
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
