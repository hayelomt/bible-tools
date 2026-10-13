import { useId } from 'react';

/** One section of a settings-style page, with a small muted heading (UX-PATTERNS "Typography"). */
export function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}
