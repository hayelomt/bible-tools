import {
  BUILT_IN_TEMPLATES,
  type DefaultTemplates,
  LESSON_KINDS,
  type LessonKind,
  type Template,
  templateSummary,
} from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import { NativeSelect } from '@lamp/ui/components/native-select';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Plus } from 'lucide-react';
import { useId } from 'react';
import { PageSection } from '@/components/page-section.tsx';
import { updateSettings } from '@/data/actions/settings.ts';
import { allTemplates } from '@/data/queries.ts';
import { useSettings } from '@/data/use-settings.ts';
import { KIND_LABELS } from '@/lib/labels.ts';
import { runWrite } from '@/lib/run-write.ts';

export const Route = createFileRoute('/_app/settings/templates/')({
  staticData: { title: 'Templates', back: '/settings' },
  component: TemplatesSettings,
});

const rowClass =
  'flex min-h-14 items-center gap-3 px-4 py-2 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * Settings → Templates (F25, M10-13, M10-14, wireframes/thinking.md): the template each kind of
 * new lesson starts with, the user's own templates, and the built-ins to copy. Synced.
 */
function TemplatesSettings() {
  const settings = useSettings();
  const own = useLiveQuery(() => allTemplates(), []);
  const navigate = useNavigate();
  if (!settings || !own) return null;

  return (
    <div className="flex flex-col gap-8">
      <PageSection title="New lessons start with">
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3">
          {LESSON_KINDS.map((kind) => (
            <KindDefault key={kind} kind={kind} defaults={settings.defaultTemplates} own={own} />
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          A new lesson starts with its kind’s template. Changing a new lesson’s kind swaps it, until
          something is written in it.
        </p>
      </PageSection>

      <PageSection
        title="Yours"
        action={
          <Button variant="ghost" size="sm" render={<Link to="/settings/templates/new" />}>
            <Plus /> New
          </Button>
        }
      >
        {own.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No templates of your own yet. Save one from a lesson’s ⋯, or make one here.
          </p>
        ) : (
          <ul aria-label="Your templates" className="flex flex-col divide-y rounded-xl border">
            {own.map((template) => (
              <li key={template.id}>
                <Link
                  to="/settings/templates/$templateId"
                  params={{ templateId: template.id }}
                  className={rowClass}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{template.name}</span>
                    <span className="truncate text-sm text-muted-foreground">
                      {templateSummary(template.structure)}
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PageSection>

      <PageSection title="Built in">
        <ul aria-label="Built-in templates" className="flex flex-col divide-y rounded-xl border">
          {BUILT_IN_TEMPLATES.map((template) => (
            <li key={template.key} className="flex min-h-14 items-center gap-3 px-4 py-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{template.name}</span>
                <span className="text-sm text-muted-foreground">
                  {templateSummary(template.structure)}
                </span>
              </span>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Copy ${template.name} to edit`}
                onClick={() =>
                  void navigate({ to: '/settings/templates/new', search: { copy: template.key } })
                }
              >
                Copy to edit
              </Button>
            </li>
          ))}
        </ul>
      </PageSection>
    </div>
  );
}

interface KindDefaultProps {
  kind: LessonKind;
  defaults: DefaultTemplates;
  own: Template[];
}

/** One kind's default: none, a built-in or one of the user's own. A deleted one shows as none. */
function KindDefault({ kind, defaults, own }: KindDefaultProps) {
  const id = useId();
  const chosen = defaults[kind];
  const known =
    chosen !== null &&
    (BUILT_IN_TEMPLATES.some((t) => t.key === chosen) || own.some((t) => t.id === chosen));
  return (
    <>
      <label htmlFor={id} className="text-sm">
        {KIND_LABELS[kind]}
      </label>
      <NativeSelect
        id={id}
        value={known ? chosen : ''}
        onChange={(event) =>
          runWrite(
            updateSettings({
              defaultTemplates: { ...defaults, [kind]: event.target.value || null },
            }),
            'the default template',
          )
        }
      >
        <option value="">No template</option>
        <optgroup label="Built in">
          {BUILT_IN_TEMPLATES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </optgroup>
        {own.length > 0 && (
          <optgroup label="Yours">
            {own.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        )}
      </NativeSelect>
    </>
  );
}
