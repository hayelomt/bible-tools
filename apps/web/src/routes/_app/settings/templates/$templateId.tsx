import { Button } from '@lamp/ui/components/button';
import { toast } from '@lamp/ui/components/sonner';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { ScreenTitle } from '@/components/shell/slots.tsx';
import { TemplateEditor } from '@/components/templates/template-editor.tsx';
import { deleteTemplate, restoreTemplate, updateTemplate } from '@/data/actions/templates.ts';
import { db } from '@/data/db.ts';
import { runWrite } from '@/lib/run-write.ts';

export const Route = createFileRoute('/_app/settings/templates/$templateId')({
  staticData: { back: '/settings/templates' },
  component: EditTemplate,
});

/** One of the user's own templates, to change or delete (M10-13). */
function EditTemplate() {
  const { templateId } = Route.useParams();
  const navigate = useNavigate();
  const template = useLiveQuery(
    async () => (await db.template.get(templateId)) ?? null,
    [templateId],
  );
  if (template === undefined) return <ScreenSkeleton />;
  if (template === null || template.deletedAt !== null) {
    return (
      <>
        <ScreenTitle>Template not found</ScreenTitle>
        <NotFoundScreen>
          This template doesn’t exist on this device. It may have been deleted, or not synced here
          yet.
        </NotFoundScreen>
      </>
    );
  }
  const back = () => navigate({ to: '/settings/templates' });
  return (
    <div className="flex flex-col gap-8">
      <ScreenTitle>{template.name}</ScreenTitle>
      {/* Keyed by the row's time, so a change synced from elsewhere starts the form again. */}
      <TemplateEditor
        key={template.updatedAt}
        name={template.name}
        structure={template.structure}
        saveLabel="Save"
        onSave={async (fields) => {
          await updateTemplate(template.id, fields);
          await back();
        }}
        onCancel={() => void back()}
      />
      <Button
        variant="destructive"
        className="self-start"
        onClick={async () => {
          await deleteTemplate(template.id);
          await back();
          // Lessons made from it don't change; a default naming it counts as none.
          toast(`Template “${template.name}” deleted.`, {
            duration: 10_000,
            action: {
              label: 'Undo',
              onClick: () => runWrite(restoreTemplate(template.id), 'the template'),
            },
          });
        }}
      >
        Delete template
      </Button>
    </div>
  );
}
