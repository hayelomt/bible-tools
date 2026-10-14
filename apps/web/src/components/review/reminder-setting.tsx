import { Switch } from '@lamp/ui/components/switch';
import { useEffect, useState } from 'react';
import { type ReminderState, reminderState, setReminder } from '@/lib/reminder.ts';

/**
 * Settings → Review → Weekly reminder (F9). Where the browser can't send one, a line says the
 * count stands in instead. Per device, so not synced.
 */
export function ReminderSetting() {
  const [state, setState] = useState<ReminderState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    // A browser that fails to say (one not installed, say) can't remind either.
    void reminderState()
      .catch((): ReminderState => 'unsupported')
      .then((next) => live && setState(next));
    return () => {
      live = false;
    };
  }, []);

  if (state === null) return null;
  if (state === 'unsupported') {
    return (
      <p className="text-sm text-muted-foreground">
        This browser can’t send reminders. The Review tab shows a count instead.
      </p>
    );
  }
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="flex flex-col gap-0.5">
        Weekly reminder
        <span className="text-sm text-muted-foreground">
          {state === 'blocked'
            ? 'Notifications are blocked for Lamp. Allow them in the browser’s site settings.'
            : 'About once a week, when questions or verses are waiting. On this device only.'}
        </span>
      </span>
      <Switch
        checked={state === 'on'}
        disabled={busy}
        onCheckedChange={(on) => {
          setBusy(true);
          void setReminder(on)
            .catch(() => state)
            .then(setState)
            .finally(() => setBusy(false));
        }}
      />
    </label>
  );
}
