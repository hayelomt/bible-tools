import type { Lesson } from '@lamp/domain';
import { cn } from 'cn';
import { ChevronDown } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { type SectionRequest, SectionList } from '@/components/sections/section-list.tsx';
import { ScreenActions, ScreenTitle, SidePanel } from '@/components/shell/slots.tsx';
import type { LessonFields } from '@/data/actions/lessons.ts';
import { longDate, today } from '@/lib/dates.ts';
import { SOURCE_LABELS } from '@/lib/labels.ts';
import { useMediaQuery } from '@/lib/use-media-query.ts';
import { AddButton } from './add-button.tsx';
import { LessonDetails } from './lesson-details.tsx';
import { LessonMenu } from './lesson-menu.tsx';
import { PanelHeading } from './panel-heading.tsx';
import { Questions } from './questions.tsx';
import { type PanelApi, Takeaways } from './takeaways.tsx';
import { useLessonSaver } from './use-lesson-saver.ts';

/** The side panel needs room for the sidebar, the 42 rem column and itself. */
const WIDE = '(min-width: 80rem)';

interface LessonEditorProps {
  id: string;
  /** The stored lesson; `null` for a new one that hasn't got a title yet. */
  lesson: Lesson | null;
  /** The series a new lesson starts in ("New lesson in John"). */
  seriesId?: string;
  /** A section, takeaway or question to scroll to and highlight as the lesson opens. */
  reveal?: { section?: string; takeaway?: string; question?: string };
}

/** What a new lesson starts with (wireframes/lessons.md): today, a sermon, no series. */
function newLesson(seriesId?: string): LessonFields {
  return {
    seriesId: seriesId ?? null,
    title: '',
    date: today(),
    source: 'sermon',
    speaker: null,
    church: null,
    mainPassages: [],
  };
}

/**
 * Lesson capture and edit on one screen (F1, wireframes/lessons.md "Lesson: capture and edit"):
 * the title, large, then a line with the date and source that opens the details. On a wide laptop
 * the details sit in the side panel instead. Everything saves as it's typed; there's no Save.
 */
export function LessonEditor({ id, lesson, seriesId, reveal }: LessonEditorProps) {
  const saver = useLessonSaver(id, lesson, () => newLesson(seriesId));
  const { values, save, flush, saving } = saver;
  const [title, setTitle] = useState(values.title);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sectionsSaving, setSectionsSaving] = useState(false);
  // Enter in the title asks for the cursor in the first section; a count, so each Enter asks again.
  const [focusFirst, setFocusFirst] = useState(0);
  // Asks of the section list: show a section, or answer a question in a new one.
  const [request, setRequest] = useState<SectionRequest | undefined>(
    reveal?.section ? { kind: 'reveal', sectionId: reveal.section, seq: 1 } : undefined,
  );
  const requests = useRef(1);
  const takeaways = useRef<PanelApi>(null);
  const questions = useRef<PanelApi>(null);
  const wide = useMediaQuery(WIDE);
  const titleId = useId();
  const errorId = useId();
  const detailsId = useId();
  // An empty title isn't stored; the stored one stays until a new one is typed.
  const missingTitle = lesson !== null && !title.trim();

  // Takeaways and questions belong to a stored lesson, like its sections. On a phone they're added
  // with the + button and show only once there's one, so an empty lesson stays uncluttered.
  const extras = lesson && (
    <>
      <Takeaways ref={takeaways} lessonId={id} hideWhenEmpty={!wide} reveal={reveal?.takeaway} />
      <Questions
        ref={questions}
        lessonId={id}
        hideWhenEmpty={!wide}
        reveal={reveal?.question}
        onAnswer={(questionId) =>
          setRequest({ kind: 'answer', questionId, seq: ++requests.current })
        }
        onShowAnswer={(sectionId) =>
          setRequest({ kind: 'reveal', sectionId, seq: ++requests.current })
        }
      />
    </>
  );

  return (
    // On a phone the page ends with room for the + button, so it never covers the last line.
    <div className={cn('flex flex-col gap-2', lesson && !wide && 'pb-20')}>
      <ScreenTitle>
        <span className="sr-only">{lesson?.title ?? 'New lesson'}</span>
      </ScreenTitle>
      <ScreenActions>
        <output className="px-2 text-sm text-muted-foreground">
          {lesson && !saving && !sectionsSaving ? 'Saved' : ''}
        </output>
        {lesson && <LessonMenu lesson={lesson} />}
      </ScreenActions>

      <label htmlFor={titleId} className="sr-only">
        Title
      </label>
      <input
        id={titleId}
        value={title}
        maxLength={200}
        placeholder="Lesson title"
        // A new lesson opens ready to type its title (wireframes/lessons.md).
        // oxlint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={lesson === null}
        autoComplete="off"
        aria-invalid={missingTitle || undefined}
        aria-describedby={missingTitle ? errorId : undefined}
        data-slot="lesson-title-input"
        className="w-full bg-transparent font-serif text-2xl font-semibold outline-none placeholder:text-muted-foreground lg:text-3xl"
        onChange={(event) => {
          setTitle(event.target.value);
          if (event.target.value.trim()) save({ title: event.target.value }, { debounce: true });
        }}
        onBlur={flush}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
          event.preventDefault();
          if (!title.trim()) return;
          // A new lesson is stored now, so its first section can be typed in.
          flush();
          setFocusFirst((n) => n + 1);
        }}
      />
      {missingTitle && (
        <p id={errorId} className="text-sm text-destructive">
          A lesson needs a title.
        </p>
      )}

      <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
        <span>{longDate(values.date)}</span>
        <span aria-hidden>·</span>
        <span>{SOURCE_LABELS[values.source]}</span>
        {values.speaker && (
          <>
            <span aria-hidden>·</span>
            <span>{values.speaker}</span>
          </>
        )}
        {!wide && (
          <>
            <span aria-hidden>·</span>
            <button
              type="button"
              aria-expanded={detailsOpen}
              aria-controls={detailsId}
              onClick={() => setDetailsOpen((open) => !open)}
              className="-mx-1 flex items-center gap-0.5 rounded-md px-1 text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
            >
              Details
              <ChevronDown
                aria-hidden
                className={`size-4 transition-transform ${detailsOpen ? 'rotate-180' : ''}`}
              />
            </button>
          </>
        )}
      </p>

      {wide ? (
        <SidePanel>
          <div className="flex flex-col gap-8">
            <section aria-labelledby={detailsId} className="flex flex-col gap-3">
              <PanelHeading id={detailsId}>Details</PanelHeading>
              <LessonDetails saver={saver} lessonId={lesson ? id : null} />
            </section>
            {extras}
          </div>
        </SidePanel>
      ) : (
        detailsOpen && (
          <div id={detailsId} className="mt-2 rounded-xl border p-4">
            <LessonDetails saver={saver} lessonId={lesson ? id : null} />
          </div>
        )
      )}

      {/* Sections belong to a stored lesson, so they show once the title is typed. */}
      {lesson && (
        <div className="mt-4">
          <SectionList
            lessonId={id}
            focusFirst={focusFirst}
            request={request}
            onSavingChange={setSectionsSaving}
          />
        </div>
      )}
      {/* On a laptop they're in the side panel, under the details. */}
      {!wide && extras && (
        <>
          <div className="mt-8 flex flex-col gap-8 empty:hidden">{extras}</div>
          <AddButton
            onAddTakeaway={() => takeaways.current?.add()}
            onAddQuestion={() => questions.current?.add()}
          />
        </>
      )}
    </div>
  );
}
