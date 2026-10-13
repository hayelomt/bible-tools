import { Button } from '@lamp/ui/components/button';
import { Plus } from 'lucide-react';

interface PanelHeadingProps {
  id: string;
  children: React.ReactNode;
  /** "+ Add", named for what it adds ("Add takeaway"). */
  add?: { label: string; onClick: () => void };
}

/** A lesson panel's heading (DETAILS, TAKEAWAYS, QUESTIONS), with its "+ Add". */
export function PanelHeading({ id, children, add }: PanelHeadingProps) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-2">
      <h2 id={id} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {children}
      </h2>
      {add && (
        <Button variant="ghost" size="sm" aria-label={add.label} onClick={add.onClick}>
          <Plus aria-hidden />
          Add
        </Button>
      )}
    </div>
  );
}
