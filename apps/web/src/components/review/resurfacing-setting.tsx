import type { Resurfacing } from '@lamp/domain';
import { Switch } from '@lamp/ui/components/switch';
import { updateSettings } from '@/data/actions/settings.ts';

const RULES: { key: keyof Resurfacing; label: string; hint: string }[] = [
  { key: 'yearAgo', label: 'A year ago', hint: 'Lessons from this week in earlier years.' },
  {
    key: 'repeatedVerse',
    label: 'Repeated verses',
    hint: 'Verses in three or more lessons, not read as a commentary in six months.',
  },
  { key: 'staleQuestion', label: 'Stale questions', hint: 'Questions open for over 90 days.' },
];

/**
 * Settings → Review → "Bring back" (F30, wireframes/reflection.md): each resurfacing rule on or
 * off. Applies at once and syncs.
 */
export function ResurfacingSetting({ value }: { value: Resurfacing }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2">Bring back</legend>
      {RULES.map(({ key, label, hint }) => (
        <label key={key} className="flex items-center justify-between gap-4">
          <span className="flex flex-col gap-0.5">
            {label}
            <span className="text-sm text-muted-foreground">{hint}</span>
          </span>
          <Switch
            checked={value[key]}
            onCheckedChange={(on) => void updateSettings({ resurfacing: { ...value, [key]: on } })}
          />
        </label>
      ))}
    </fieldset>
  );
}
