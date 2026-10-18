import { Button } from '@lamp/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@lamp/ui/components/dropdown-menu';
import { Plus } from 'lucide-react';
import { useTyping } from '@/lib/is-typing.ts';

interface AddButtonProps {
  onAddTakeaway: () => void;
  onAddQuestion: () => void;
  onRevisitQuestion: () => void;
}

/**
 * The lesson's + button on a phone: adds a takeaway or a question, whose lists stay off the page
 * until there's one. It floats above the bottom bar, and goes while something is being typed, so
 * it never covers the text or the editing toolbar.
 */
export function AddButton({ onAddTakeaway, onAddQuestion, onRevisitQuestion }: AddButtonProps) {
  const typing = useTyping();
  if (typing) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="icon"
            aria-label="Add to lesson"
            className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 size-14 rounded-full shadow-lg lg:bottom-6 [&_svg:not([class*='size-'])]:size-6"
          />
        }
      >
        <Plus aria-hidden />
      </DropdownMenuTrigger>
      {/* The cursor goes into the new takeaway or question, not back to the button. */}
      <DropdownMenuContent side="top" align="end" finalFocus={false} className="w-52">
        <DropdownMenuItem onClick={onAddTakeaway}>Add takeaway</DropdownMenuItem>
        <DropdownMenuItem onClick={onAddQuestion}>Add question</DropdownMenuItem>
        <DropdownMenuItem onClick={onRevisitQuestion}>Revisit a question…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
