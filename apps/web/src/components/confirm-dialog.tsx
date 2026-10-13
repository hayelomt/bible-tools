import { Button } from '@lamp/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@lamp/ui/components/dialog';
import { useRef } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A question that names the thing: "Delete the series John?" */
  title: string;
  /** What happens to anything attached. */
  description: string;
  /** What would be lost, in the destructive colour: "3 changes never synced". */
  warning?: string | null;
  /** The verb again, with a count when there is one: "Delete all 3". */
  confirmLabel: string;
  /** `default` for an action that loses nothing, like signing out. */
  variant?: 'destructive' | 'default';
  onConfirm: () => void | Promise<void>;
}

/**
 * A confirmation for a removal that can't be undone, or for an action people worry about, like
 * signing out (UX-PATTERNS "Confirmations").
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  warning,
  confirmLabel,
  variant = 'destructive',
  onConfirm,
}: ConfirmDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} initialFocus={cancel}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {warning && (
          <p role="alert" className="text-sm text-destructive">
            {warning}
          </p>
        )}
        <DialogFooter>
          <DialogClose ref={cancel} render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            variant={variant}
            onClick={async () => {
              await onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
