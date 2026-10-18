import { SOURCE_TYPES } from '@lamp/domain';
import { Input } from '@lamp/ui/components/input';
import { useId, useState } from 'react';
import { Segmented } from '@/components/segmented.tsx';
import { SOURCE_TYPE_LABELS } from '@/lib/labels.ts';
import { webAddress } from '@/lib/media-time.ts';
import { atTimeOfDay, midnightOf, timeOfDay } from '@/lib/source-time.ts';
import type { LessonSaver } from './use-lesson-saver.ts';

const NO_SOURCE = {
  sourceType: null,
  sourceTitle: null,
  sourceAuthor: null,
  sourceUrl: null,
  sourceStartedAt: null,
};

/**
 * The lesson's source (F28, M11-06, wireframes/sermon.md "Lesson source"), under SOURCE in its
 * Details: type, title, link, author and when the recording starts, which section times count
 * from. Inside the details' grid, so its labels line up with theirs.
 */
export function SourceFields({ saver, labelClass }: { saver: LessonSaver; labelClass: string }) {
  const { values, save, flush } = saver;
  const [title, setTitle] = useState(values.sourceTitle ?? '');
  const [author, setAuthor] = useState(values.sourceAuthor ?? '');
  const [link, setLink] = useState(values.sourceUrl ?? '');
  const [linkWrong, setLinkWrong] = useState(false);
  const ids = { title: useId(), link: useId(), author: useId(), start: useId(), error: useId() };
  const typeName = useId();
  const any = Object.keys(NO_SOURCE).some((key) => values[key as keyof typeof NO_SOURCE] !== null);
  // A time of day on the start's day, or the lesson's date for a lesson without one yet.
  const startDay = values.sourceStartedAt ?? midnightOf(values.date);

  return (
    <>
      <div className="col-span-full mt-4 flex items-center justify-between gap-2">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Source
        </span>
        {any && (
          <button
            type="button"
            onClick={() => {
              setTitle('');
              setAuthor('');
              setLink('');
              setLinkWrong(false);
              save(NO_SOURCE);
            }}
            className="rounded-md px-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
          >
            Remove source
          </button>
        )}
      </div>

      <span id={typeName} className={labelClass}>
        Type
      </span>
      <div role="radiogroup" aria-label="Source type">
        <Segmented
          name={`source-${typeName}`}
          options={SOURCE_TYPES}
          labels={SOURCE_TYPE_LABELS}
          value={values.sourceType}
          onChange={(sourceType) => save({ sourceType })}
        />
      </div>

      <label htmlFor={ids.title} className={labelClass}>
        Title
      </label>
      <Input
        id={ids.title}
        // Named for the source, apart from the lesson's own title.
        aria-label="Source title"
        value={title}
        maxLength={200}
        onChange={(event) => {
          setTitle(event.target.value);
          save({ sourceTitle: optional(event.target.value) }, { debounce: true });
        }}
        onBlur={flush}
      />

      <label htmlFor={ids.link} className={`${labelClass} @sm:self-start @sm:pt-1.5`}>
        Link
      </label>
      <div className="flex flex-col gap-1">
        <Input
          id={ids.link}
          aria-label="Source link"
          type="url"
          inputMode="url"
          value={link}
          maxLength={2048}
          placeholder="youtube.com/…"
          aria-invalid={linkWrong || undefined}
          aria-describedby={linkWrong ? ids.error : undefined}
          onChange={(event) => {
            const typed = event.target.value;
            setLink(typed);
            setLinkWrong(false);
            // The text stays while it isn't an address; only an address, or nothing, is stored.
            const url = typed.trim() ? webAddress(typed) : null;
            if (url || !typed.trim()) save({ sourceUrl: url }, { debounce: true });
          }}
          onBlur={() => {
            flush();
            if (link.trim() && !webAddress(link)) setLinkWrong(true);
          }}
        />
        {linkWrong && (
          <p id={ids.error} className="text-sm text-destructive">
            This isn’t a web address.
          </p>
        )}
      </div>

      <label htmlFor={ids.author} className={labelClass}>
        Author
      </label>
      <Input
        id={ids.author}
        aria-label="Source author"
        value={author}
        maxLength={200}
        onChange={(event) => {
          setAuthor(event.target.value);
          save({ sourceAuthor: optional(event.target.value) }, { debounce: true });
        }}
        onBlur={flush}
      />

      {values.sourceType !== 'book' && (
        <>
          <label htmlFor={ids.start} className={labelClass}>
            Starts at
          </label>
          <Input
            id={ids.start}
            aria-label="Recording starts at"
            type="time"
            step={1}
            value={values.sourceStartedAt ? timeOfDay(values.sourceStartedAt, true) : ''}
            // When the recording starts: every section's time counts from it.
            onChange={(event) => {
              const typed = event.target.value;
              if (!typed) return save({ sourceStartedAt: null });
              const at = atTimeOfDay(startDay, typed);
              if (at) save({ sourceStartedAt: at });
            }}
          />
        </>
      )}
    </>
  );
}

/** An empty optional line is stored as null; the schema trims the rest. */
const optional = (text: string) => (text.trim() ? text : null);
