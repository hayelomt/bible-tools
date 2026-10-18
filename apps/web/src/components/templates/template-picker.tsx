import { BUILT_IN_TEMPLATES, templateSummary } from '@lamp/domain';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@lamp/ui/components/dialog';
import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useId } from 'react';
import type { TemplateChoice } from '@/data/actions/templates.ts';
import { allTemplates } from '@/data/queries.ts';

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Starting an empty lesson, or adding after a section (its menu's "Add a template…"). */
  adding: boolean;
  onPick: (template: TemplateChoice) => void;
}

/**
 * "Start from a template" (F25, wireframes/thinking.md "Template picker"): the built-ins, then the
 * user's own, each with its sections in a line. A tap applies it.
 */
export function TemplatePicker({ open, onOpenChange, adding, onPick }: TemplatePickerProps) {
  const builtInId = useId();
  const yoursId = useId();
  const own = useLiveQuery(() => allTemplates(), []) ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{adding ? 'Add a template' : 'Start from a template'}</DialogTitle>
          <DialogDescription>
            {adding
              ? 'Its sections go after this one, each a heading to write under.'
              : 'Its sections replace the empty one, each a heading to write under.'}
          </DialogDescription>
        </DialogHeader>
        <TemplateList
          id={builtInId}
          title="Built in"
          templates={BUILT_IN_TEMPLATES}
          onPick={onPick}
        />
        {own.length > 0 && (
          <TemplateList
            id={yoursId}
            title="Yours"
            templates={own.map((t) => ({ key: t.id, name: t.name, structure: t.structure }))}
            onPick={onPick}
          />
        )}
        <Link
          to="/settings/templates"
          className="self-start text-sm text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Manage templates in Settings ›
        </Link>
      </DialogContent>
    </Dialog>
  );
}

interface TemplateListProps {
  id: string;
  title: string;
  templates: readonly TemplateChoice[];
  onPick: (template: TemplateChoice) => void;
}

function TemplateList({ id, title, templates, onPick }: TemplateListProps) {
  return (
    <>
      <h3 id={id} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <ul aria-labelledby={id} className="-mt-2 flex flex-col divide-y">
        {templates.map((template) => (
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
    </>
  );
}
