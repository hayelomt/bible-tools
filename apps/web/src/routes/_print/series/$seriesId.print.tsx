import { createFileRoute } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback } from 'react';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { PrintPage, SeriesDocument } from '@/components/print/print-document.tsx';
import { seriesForExport } from '@/export/load.ts';
import { type PrintSearch, validatePrintSearch } from '@/lib/print-search.ts';

export const Route = createFileRoute('/_print/series/$seriesId/print')({
  validateSearch: validatePrintSearch,
  component: SeriesPrintScreen,
});

/** A series to print or save as a PDF: a title page, then a page per lesson. */
function SeriesPrintScreen() {
  const { seriesId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const data = useLiveQuery(() => seriesForExport(seriesId), [seriesId]);
  const printed = useCallback(
    () => void navigate({ search: {} satisfies PrintSearch, replace: true }),
    [navigate],
  );

  if (data === undefined) return null;
  if (data === null) {
    return (
      <main className="p-4">
        <NotFoundScreen>
          This series doesn’t exist on this device. It may have been deleted, or not synced here
          yet.
        </NotFoundScreen>
      </main>
    );
  }
  return (
    <PrintPage
      back={{ to: '/series/$seriesId', params: { seriesId } }}
      title={data.series.title}
      printNow={search.print === true}
      onPrinted={printed}
    >
      <SeriesDocument data={data} />
    </PrintPage>
  );
}
