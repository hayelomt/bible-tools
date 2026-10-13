import { LESSON_SOURCES } from '@lamp/domain';
import { Input } from '@lamp/ui/components/input';
import { NativeSelect } from '@lamp/ui/components/native-select';
import { useLiveQuery } from 'dexie-react-hooks';
import { useId, useState } from 'react';
import { PassageInput } from '@/components/passage-input.tsx';
import { Segmented } from '@/components/segmented.tsx';
import { TagInput } from '@/components/tags/tag-input.tsx';
import { allSeries } from '@/data/queries.ts';
import { SOURCE_LABELS } from '@/lib/labels.ts';
import type { LessonSaver } from './use-lesson-saver.ts';

/** Labels sit above their fields in a narrow space (the phone, the side panel), beside them otherwise. */
const labelClass = 'text-sm text-muted-foreground not-first:mt-2 @sm:not-first:mt-0';

/** An empty optional line is stored as null; the schema trims the rest. */
const optional = (text: string) => (text.trim() ? text : null);

interface LessonDetailsProps {
  saver: LessonSaver;
  /** The stored lesson's id; null for a new lesson, which can't be tagged until it has a title. */
  lessonId: string | null;
}

/**
 * A lesson's details (wireframes/lessons.md "Details"): date, source, speaker, church, main
 * passages, series and tags. Each saves as it changes; typed fields once typing settles.
 */
export function LessonDetails({ saver, lessonId }: LessonDetailsProps) {
  const { values, save, flush } = saver;
  const series = useLiveQuery(() => allSeries(), []);
  const [speaker, setSpeaker] = useState(values.speaker ?? '');
  const [church, setChurch] = useState(values.church ?? '');
  const ids = {
    date: useId(),
    speaker: useId(),
    church: useId(),
    passages: useId(),
    series: useId(),
    tags: useId(),
  };
  const sourceName = useId();

  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-y-1.5 @sm:grid-cols-[auto_minmax(0,1fr)] @sm:items-center @sm:gap-x-4 @sm:gap-y-3">
        <label htmlFor={ids.date} className={labelClass}>
          Date
        </label>
        <Input
          id={ids.date}
          type="date"
          required
          value={values.date}
          // A cleared date isn't stored: a lesson always has one.
          onChange={(event) => event.target.value && save({ date: event.target.value })}
        />

        <span id={sourceName} className={labelClass}>
          Source
        </span>
        <div role="radiogroup" aria-labelledby={sourceName}>
          <Segmented
            name={`source-${sourceName}`}
            options={LESSON_SOURCES}
            labels={SOURCE_LABELS}
            value={values.source}
            onChange={(source) => save({ source })}
          />
        </div>

        <label htmlFor={ids.speaker} className={labelClass}>
          Speaker
        </label>
        <Input
          id={ids.speaker}
          value={speaker}
          maxLength={200}
          onChange={(event) => {
            setSpeaker(event.target.value);
            save({ speaker: optional(event.target.value) }, { debounce: true });
          }}
          onBlur={flush}
        />

        <label htmlFor={ids.church} className={labelClass}>
          Church
        </label>
        <Input
          id={ids.church}
          value={church}
          maxLength={200}
          onChange={(event) => {
            setChurch(event.target.value);
            save({ church: optional(event.target.value) }, { debounce: true });
          }}
          onBlur={flush}
        />

        <label htmlFor={ids.passages} className={`${labelClass} @sm:self-start @sm:pt-1.5`}>
          Passages
        </label>
        <PassageInput
          id={ids.passages}
          value={values.mainPassages}
          onChange={(mainPassages) => save({ mainPassages })}
        />

        <label htmlFor={ids.series} className={labelClass}>
          Series
        </label>
        <NativeSelect
          id={ids.series}
          value={values.seriesId ?? ''}
          onChange={(event) => save({ seriesId: event.target.value || null })}
        >
          <option value="">No series</option>
          {series?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </NativeSelect>

        {lessonId && (
          <>
            <label htmlFor={ids.tags} className={`${labelClass} @sm:self-start @sm:pt-1.5`}>
              Tags
            </label>
            <TagInput id={ids.tags} target={{ kind: 'lesson', id: lessonId }} />
          </>
        )}
      </div>
    </div>
  );
}
