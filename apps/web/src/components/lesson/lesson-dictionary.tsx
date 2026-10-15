import { citedRefs, type Lesson } from '@lamp/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { lessonSections } from '@/data/queries.ts';
import { DictionaryButton } from '../dictionary/dictionary.tsx';
import { passagesVerses } from '../dictionary/page-verses.ts';

/**
 * The KJV dictionary in a lesson's header, when the lesson cites KJV text: a main passage or a
 * verse chip captured from the KJV, whichever translation is set now (decided 2026-10-15).
 */
export function LessonDictionary({ lesson }: { lesson: Lesson }) {
  const sections = useLiveQuery(() => lessonSections(lesson.id), [lesson.id]);
  const refs = useMemo(
    () => [...lesson.mainPassages, ...(sections ?? []).flatMap((s) => citedRefs(s.body))],
    [lesson.mainPassages, sections],
  );
  if (!refs.some((ref) => ref.translation === 'KJV')) return null;
  return <DictionaryButton scope="lesson" load={() => passagesVerses(refs)} />;
}
