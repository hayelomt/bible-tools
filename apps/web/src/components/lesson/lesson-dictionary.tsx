import { citedRefs, type Lesson } from '@lamp/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { lessonSections } from '@/data/queries.ts';
import { useActiveTranslation } from '@/data/translation.ts';
import { DictionaryButton } from '../dictionary/dictionary.tsx';
import { passagesVerses } from '../dictionary/page-verses.ts';

/**
 * The KJV dictionary in a lesson's header, when the lesson cites KJV text: with the KJV picked in
 * Settings, a main passage or a verse chip of the app's own text (decision 97).
 */
export function LessonDictionary({ lesson }: { lesson: Lesson }) {
  const kjv = useActiveTranslation() === 'KJV';
  const sections = useLiveQuery(() => lessonSections(lesson.id), [lesson.id]);
  const refs = useMemo(
    () => [...lesson.mainPassages, ...(sections ?? []).flatMap((s) => citedRefs(s.body))],
    [lesson.mainPassages, sections],
  );
  if (!kjv || !refs.some((ref) => !ref.translation)) return null;
  return <DictionaryButton scope="lesson" load={() => passagesVerses(refs)} />;
}
