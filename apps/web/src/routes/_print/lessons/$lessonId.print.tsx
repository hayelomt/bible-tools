import { createFileRoute } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback } from 'react';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { Credit, LessonDocument, PrintPage } from '@/components/print/print-document.tsx';
import { useActiveTranslation } from '@/data/translation.ts';
import { lessonForExport } from '@/export/load.ts';
import { type PrintSearch, validatePrintSearch } from '@/lib/print-search.ts';

export const Route = createFileRoute('/_print/lessons/$lessonId/print')({
  validateSearch: validatePrintSearch,
  component: LessonPrintScreen,
});

/** A lesson to print or save as a PDF (wireframes/export.md "Print view"). */
function LessonPrintScreen() {
  const { lessonId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  // Read again in another translation when one is picked.
  const active = useActiveTranslation();
  const data = useLiveQuery(() => lessonForExport(lessonId), [lessonId, active]);
  // Asked for once: reloading or coming back shows the page without the dialog.
  const printed = useCallback(
    () => void navigate({ search: {} satisfies PrintSearch, replace: true }),
    [navigate],
  );

  if (data === undefined) return null;
  if (data === null) {
    return (
      <main className="p-4">
        <NotFoundScreen>
          This lesson doesn’t exist on this device. It may have been deleted, or not synced here
          yet.
        </NotFoundScreen>
      </main>
    );
  }
  return (
    <PrintPage
      back={{ to: '/lessons/$lessonId', params: { lessonId } }}
      title={data.lesson.title}
      printNow={search.print === true}
      onPrinted={printed}
    >
      <LessonDocument data={data} />
      <Credit lessons={[data]} />
    </PrintPage>
  );
}
