import { useId } from 'react';
import { Segmented } from '@/components/segmented.tsx';
import { updateSettings } from '@/data/actions/settings.ts';

/** The choices offered (decided 2026-10-14); a value set elsewhere joins them. */
const CHOICES = [7, 14, 30, 90];

/**
 * How many days of takeaways the review queue shows (F9: "recent"). Applies at once and syncs.
 */
export function ReviewWindowSetting({ value }: { value: number }) {
  const name = useId();
  const options = (CHOICES.includes(value) ? CHOICES : [...CHOICES, value].toSorted((a, b) => a - b))
    .map(String);
  const labels = Object.fromEntries(options.map((days) => [days, `${days} days`]));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2">Takeaways from the last</legend>
      <Segmented
        name={name}
        options={options}
        labels={labels}
        value={String(value)}
        onChange={(days) => void updateSettings({ reviewWindowDays: Number(days) })}
      />
      <p className="text-sm text-muted-foreground">
        The Review tab lists the takeaways written in that time.
      </p>
    </fieldset>
  );
}
