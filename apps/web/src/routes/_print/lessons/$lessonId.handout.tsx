import { isAppTranslation } from '@lamp/domain';
import { createFileRoute } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useMemo } from 'react';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { HandoutSheet, useHandoutFit } from '@/components/print/handout.tsx';
import { PrintPage } from '@/components/print/print-document.tsx';
import { useBooks } from '@/data/bible.ts';
import { handoutOf, leftOutNotice } from '@/export/handout.ts';
import { lessonForExport } from '@/export/load.ts';
import type { LessonForExport } from '@/export/markdown.ts';
import { type PrintSearch, validatePrintSearch } from '@/lib/print-search.ts';

export const Route = createFileRoute('/_print/lessons/$lessonId/handout')({
  validateSearch: validatePrintSearch,
  component: HandoutScreen,
});

/** A lesson on one printed page (F33, M12-05, wireframes/reflection.md "Handout"). */
function HandoutScreen() {
  const { lessonId } = Route.useParams();
  const data = useLiveQuery(() => lessonForExport(lessonId), [lessonId]);

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
  return <LessonHandout data={data} />;
}

function LessonHandout({ data }: { data: LessonForExport }) {
  const { lessonId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const printed = useCallback(
    () => void navigate({ search: {} satisfies PrintSearch, replace: true }),
    [navigate],
  );
  // Text from outside Lamp has no book: it prints as its reference.
  const wanted = useMemo(
    () =>
      data.lesson.mainPassages.flatMap((ref) =>
        isAppTranslation(ref.translation) ? [{ translation: ref.translation, book: ref.book }] : [],
      ),
    [data.lesson.mainPassages],
  );
  const states = useBooks(wanted);
  const loading = states.some((s) => s.status === 'loading');
  let next = 0;
  const books = data.lesson.mainPassages.map((ref) => {
    if (!isAppTranslation(ref.translation)) return null;
    const state = states[next++]!;
    return state.status === 'ready' ? state.text : null;
  });
  const handout = handoutOf(data, books);
  const { box, layout, settled } = useHandoutFit(handout);

  return (
    <PrintPage
      back={{ to: '/lessons/$lessonId', params: { lessonId } }}
      title={data.lesson.title}
      // Once the passages' text is in and the page is fitted to it.
      printNow={search.print === true && !loading && settled}
      onPrinted={printed}
      notice={leftOutNotice(layout)}
      bare
    >
      <HandoutSheet handout={handout} layout={layout} box={box} />
    </PrintPage>
  );
}
