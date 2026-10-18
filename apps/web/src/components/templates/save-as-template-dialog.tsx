import { MAX_TEMPLATE_NAME } from '@lamp/domain';
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
import { Input } from '@lamp/ui/components/input';
import { Label } from '@lamp/ui/components/label';
import { toast } from '@lamp/ui/components/sonner';
import { useNavigate } from '@tanstack/react-router';
import { useId, useState } from 'react';
import { saveLessonAsTemplate } from '@/data/actions/templates.ts';

interface SaveAsTemplateDialogProps {
  lessonId: string;
  /** The lesson's title: the name it suggests. */
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The lesson's "Save as template…" (F25, M10-13, wireframes/thinking.md): its section headings,
 * not their text, as a template of the user's own.
 */
export function SaveAsTemplateDialog({ open, onOpenChange, ...props }: SaveAsTemplateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted only while open, so each opening suggests the lesson's title again. */}
        {open && <SaveForm {...props} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

function SaveForm({ lessonId, title, onOpenChange }: Omit<SaveAsTemplateDialogProps, 'open'>) {
  const navigate = useNavigate();
  const [name, setName] = useState(title.slice(0, MAX_TEMPLATE_NAME));
  const [problem, setProblem] = useState<string | null>(null);
  const ids = { name: useId(), error: useId() };

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setProblem('A template needs a name.');
    const saved = await saveLessonAsTemplate(lessonId, name.trim());
    if (!saved) {
      return setProblem('No section here starts with a heading, so there’s nothing to keep.');
    }
    onOpenChange(false);
    toast(`Saved “${saved.name}” as a template.`, {
      action: {
        label: 'Edit',
        onClick: () =>
          void navigate({
            to: '/settings/templates/$templateId',
            params: { templateId: saved.id },
          }),
      },
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Save as template</DialogTitle>
        <DialogDescription>
          It keeps the headings of the sections and replies, not what’s written under them.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor={ids.name}>Name</Label>
        <Input
          id={ids.name}
          value={name}
          maxLength={MAX_TEMPLATE_NAME}
          required
          aria-invalid={!!problem || undefined}
          aria-describedby={problem ? ids.error : undefined}
          onChange={(event) => {
            setName(event.target.value);
            setProblem(null);
          }}
        />
        {problem && (
          <p id={ids.error} className="text-sm text-destructive">
            {problem}
          </p>
        )}
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit">Save template</Button>
      </DialogFooter>
    </form>
  );
}
