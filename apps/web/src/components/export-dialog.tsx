import { Button } from '@lamp/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@lamp/ui/components/dialog';
import { toast } from '@lamp/ui/components/sonner';
import { Copy, FileDown } from 'lucide-react';
import type { Exported } from '@/export/load.ts';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The lesson's or series' title. */
  title: string;
  /** Reads the rows as they are now; null when it's gone. */
  load: () => Promise<Exported | null>;
}

/**
 * Export (F11, wireframes/export.md "Export menu"), from a lesson's or a series' `⋯`: a Markdown
 * file, downloaded at once and offline, or the same Markdown copied. Print joins it in M6-06.
 */
export function ExportDialog({ open, onOpenChange, title, load }: ExportDialogProps) {
  async function run(use: (exported: Exported) => Promise<void> | void) {
    try {
      const exported = await load();
      if (!exported) return;
      await use(exported);
      onOpenChange(false);
    } catch (error) {
      // The clipboard can be refused, and a read can fail; the dialog stays open to try again.
      console.error('Export failed', error);
      toast('Couldn’t export it. Try again.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export “{title}”</DialogTitle>
          <DialogDescription>
            Markdown keeps the notes, verses, tags and questions.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            className="justify-start pointer-coarse:min-h-11"
            onClick={() => void run(({ fileName, markdown }) => download(fileName, markdown))}
          >
            <FileDown aria-hidden />
            Markdown file (.md)
          </Button>
          <Button
            variant="outline"
            className="justify-start pointer-coarse:min-h-11"
            onClick={() =>
              void run(async ({ markdown }) => {
                await navigator.clipboard.writeText(markdown);
                toast('Copied.');
              })
            }
          >
            <Copy aria-hidden />
            Copy as Markdown
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Saves `text` as a file, from the device: no network, so it works offline. */
function download(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // After the click has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
