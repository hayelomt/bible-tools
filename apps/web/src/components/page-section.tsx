import { useId } from 'react';

interface PageSectionProps {
  title: string;
  /** A small control at the end of the heading's line ("+ New"). */
  action?: React.ReactNode;
  children: React.ReactNode;
}

/** One section of a page (settings, the lessons home), with a small muted heading (UX-PATTERNS "Typography"). */
export function PageSection({ title, action, children }: PageSectionProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div
        data-slot="page-section-header"
        className="flex min-h-7 items-center justify-between gap-4"
      >
        <h2
          id={id}
          data-slot="page-section-title"
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
