import { Button } from '@lamp/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@lamp/ui/components/dropdown-menu';
import { Plus } from 'lucide-react';

interface PanelHeadingProps {
  id: string;
  children: React.ReactNode;
  /**
   * "+ Add", named for what it adds ("Add takeaway"). With `menu`, it offers a choice instead
   * (Questions: "New question" and "Revisit a question…").
   */
  add?: { label: string; onClick?: () => void; menu?: { label: string; onClick: () => void }[] };
}

/** A lesson panel's heading (DETAILS, TAKEAWAYS, QUESTIONS), with its "+ Add". */
export function PanelHeading({ id, children, add }: PanelHeadingProps) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-2">
      <h2 id={id} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {children}
      </h2>
      {add?.menu ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" aria-label={add.label} />}>
            <Plus aria-hidden />
            Add
          </DropdownMenuTrigger>
          {/* The cursor goes into what's added, not back to the button. */}
          <DropdownMenuContent align="end" finalFocus={false} className="w-48">
            {add.menu.map((item) => (
              <DropdownMenuItem key={item.label} onClick={item.onClick}>
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        add && (
          <Button variant="ghost" size="sm" aria-label={add.label} onClick={add.onClick}>
            <Plus aria-hidden />
            Add
          </Button>
        )
      )}
    </div>
  );
}
