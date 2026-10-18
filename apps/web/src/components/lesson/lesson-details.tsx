import { LESSON_KINDS } from '@lamp/domain';
import { Input } from '@lamp/ui/components/input';
import { NativeSelect } from '@lamp/ui/components/native-select';
import { useLiveQuery } from 'dexie-react-hooks';
import { useId, useState } from 'react';
import { PassageInput } from '@/components/passage-input.tsx';
import { Segmented } from '@/components/segmented.tsx';
import { SeriesDialog } from '@/components/series/series-dialog.tsx';
import { TagInput } from '@/components/tags/tag-input.tsx';
import { allSeries } from '@/data/queries.ts';
import { KIND_LABELS } from '@/lib/labels.ts';
import { SourceFields } from './source-fields.tsx';
import type { LessonSaver } from './use-lesson-saver.ts';

/** Not a series id (those are UUIDs): choosing it opens the new-series dialog. */
const CREATE_SERIES = 'create';

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
 * A lesson's details (wireframes/lessons.md "Details"): date, kind, speaker, church, main
 * passages, series and tags, then its source (M11-06). Each saves as it changes; typed fields once
 * typing settles.
 */
export function LessonDetails({ saver, lessonId }: LessonDetailsProps) {
  const { values, save, flush } = saver;
  const series = useLiveQuery(() => allSeries(), []);
  const [creatingSeries, setCreatingSeries] = useState(false);
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
  const kindName = useId();

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

        <span id={kindName} className={labelClass}>
          Kind
        </span>
        <div role="radiogroup" aria-labelledby={kindName}>
          <Segmented
            name={`kind-${kindName}`}
            options={LESSON_KINDS}
            labels={KIND_LABELS}
            value={values.kind}
            onChange={(kind) => save({ kind })}
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
          onChange={(event) => {
            const next = event.target.value;
            // The value stays the current series; the dialog assigns the one it creates.
            if (next === CREATE_SERIES) {
              event.target.value = values.seriesId ?? '';
              setCreatingSeries(true);
              return;
            }
            save({ seriesId: next || null });
          }}
        >
          <option value="">No series</option>
          {series?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
          <option value={CREATE_SERIES}>Create series…</option>
        </NativeSelect>

        {lessonId && (
          <>
            <label htmlFor={ids.tags} className={`${labelClass} @sm:self-start @sm:pt-1.5`}>
              Tags
            </label>
            <TagInput id={ids.tags} target={{ kind: 'lesson', id: lessonId }} />
          </>
        )}

        <SourceFields saver={saver} labelClass={labelClass} />
      </div>
      <SeriesDialog
        open={creatingSeries}
        onOpenChange={setCreatingSeries}
        onSaved={(created) => save({ seriesId: created.id })}
      />
    </div>
  );
}
