import { BUILT_IN_TEMPLATES, type BuiltInTemplate, templateSummary } from '@lamp/domain';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@lamp/ui/components/dialog';
import { useId } from 'react';

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Starting an empty lesson, or adding after a section (its menu's "Add a template…"). */
  adding: boolean;
  onPick: (template: BuiltInTemplate) => void;
}

/**
 * "Start from a template" (F25, wireframes/thinking.md "Template picker"): each template with its
 * sections in a line. A tap applies it. The user's own templates join the built-ins in M10-13.
 */
export function TemplatePicker({ open, onOpenChange, adding, onPick }: TemplatePickerProps) {
  const builtInId = useId();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{adding ? 'Add a template' : 'Start from a template'}</DialogTitle>
          <DialogDescription>
            {adding
              ? 'Its sections go after this one, each a heading to write under.'
              : 'Its sections replace the empty one, each a heading to write under.'}
          </DialogDescription>
        </DialogHeader>
        <h3
          id={builtInId}
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          Built in
        </h3>
        <ul aria-labelledby={builtInId} className="-mt-2 flex flex-col divide-y">
          {BUILT_IN_TEMPLATES.map((template) => (
            <li key={template.key}>
              <button
                type="button"
                onClick={() => onPick(template)}
                className="-mx-2 flex w-[calc(100%+1rem)] flex-col items-start rounded-lg px-2 py-2 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
              >
                <span className="font-medium">{template.name}</span>
                <span className="text-sm text-muted-foreground">
                  {templateSummary(template.structure)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
