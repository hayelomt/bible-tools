import { Button } from '@lamp/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@lamp/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@lamp/ui/components/dropdown-menu';
import { Ellipsis } from 'lucide-react';
import { useState } from 'react';
import { YouVersionImport } from '@/components/import/youversion-import.tsx';
import { ScreenActions } from '@/components/shell/slots.tsx';

/**
 * The Inbox's `⋯` (wireframes/interop.md): Import from YouVersion (M9-11), the same panel as in
 * Settings → Import, in a dialog. Closing it leaves an import running.
 */
export function InboxMenu() {
  const [importing, setImporting] = useState(false);
  return (
    <ScreenActions>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label="Inbox actions" />}
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setImporting(true)}>
            Import from YouVersion…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={importing} onOpenChange={setImporting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import</DialogTitle>
          </DialogHeader>
          <YouVersionImport />
        </DialogContent>
      </Dialog>
    </ScreenActions>
  );
}
