import { builtInTemplate } from '@lamp/domain';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { TemplateEditor } from '@/components/templates/template-editor.tsx';
import { createTemplate } from '@/data/actions/templates.ts';

interface NewTemplateSearch {
  /** A built-in to start from ("Copy to edit"). */
  copy?: string;
}

export const Route = createFileRoute('/_app/settings/templates/new')({
  staticData: { title: 'New template', back: '/settings/templates' },
  validateSearch: (search: Record<string, unknown>): NewTemplateSearch => ({
    copy: typeof search.copy === 'string' ? search.copy : undefined,
  }),
  component: NewTemplate,
});

/** A template made from scratch, or a copy of a built-in to change (M10-13). */
function NewTemplate() {
  const { copy } = Route.useSearch();
  const navigate = useNavigate();
  const from = copy ? builtInTemplate(copy) : undefined;
  const back = () => navigate({ to: '/settings/templates' });
  return (
    <TemplateEditor
      key={copy ?? ''}
      name={from ? `${from.name} (copy)` : ''}
      structure={from?.structure ?? []}
      saveLabel="Create template"
      onSave={async (fields) => {
        await createTemplate(fields);
        await back();
      }}
      onCancel={() => void back()}
    />
  );
}
