import { Button } from '@lamp/ui/components/button';
import { toast } from '@lamp/ui/components/sonner';
import { useNavigate } from '@tanstack/react-router';
import { ClipboardPaste } from 'lucide-react';

/**
 * "Add from clipboard" (M9-07, wireframes/interop.md "Inbox"): the main way in where the share
 * sheet can't reach Lamp (an iPhone). It reads the clipboard once, when tapped (the browser may
 * ask first), and opens the share screen with the text as a paste, so the references and verses
 * in it are found the same way (decided 2026-10-18).
 */
export function ClipboardButton() {
  const navigate = useNavigate();

  async function read() {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      toast.error('Lamp couldn’t read the clipboard. Paste into the box instead.');
      return;
    }
    if (!text.trim()) {
      toast('The clipboard is empty.');
      return;
    }
    void navigate({ to: '/share', search: { text, from: 'clipboard' } });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="pointer-coarse:min-h-11"
      onClick={() => void read()}
    >
      <ClipboardPaste />
      Add from clipboard
    </Button>
  );
}
