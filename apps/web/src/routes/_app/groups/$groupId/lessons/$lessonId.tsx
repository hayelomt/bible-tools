import { formatPassage, ownLessonId } from '@lamp/domain';
import { createFileRoute, Navigate } from '@tanstack/react-router';
import { cn } from 'cn';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { GroupQuestions } from '@/components/groups/group-questions.tsx';
import { GroupThread } from '@/components/groups/group-thread.tsx';
import {
  type ThreadMode,
  threadModeOf,
  ThreadSwitch,
  useGroupThread,
} from '@/components/groups/thread-switch.tsx';
import { AddButton } from '@/components/lesson/add-button.tsx';
import { Questions, type QuestionsApi } from '@/components/lesson/questions.tsx';
import { type PanelApi, Takeaways } from '@/components/lesson/takeaways.tsx';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { type SectionRequest, SectionList } from '@/components/sections/section-list.tsx';
import { ScreenTitle, SidePanel } from '@/components/shell/slots.tsx';
import { ensureOwnLesson } from '@/data/actions/group-thread.ts';
import { db } from '@/data/db.ts';
import { memberThread, type ThreadPlace } from '@/data/group-thread.ts';
import { useAccount } from '@/lib/account.ts';
import { longDate } from '@/lib/dates.ts';
import { KIND_LABELS } from '@/lib/labels.ts';
import { runWrite } from '@/lib/run-write.ts';
import { useMediaQuery } from '@/lib/use-media-query.ts';

interface GroupLessonSearch {
  /** Which thread shows; the group's unless it says otherwise. */
  thread?: ThreadMode;
  /** A group question to answer in the thread (the group queue's Answer, M13-10). */
  groupAnswer?: string;
}

export const Route = createFileRoute('/_app/groups/$groupId/lessons/$lessonId')({
  staticData: { back: '../..' },
  validateSearch: (search: Record<string, unknown>): GroupLessonSearch => ({
    thread: threadModeOf(search.thread),
    groupAnswer: typeof search.groupAnswer === 'string' ? search.groupAnswer : undefined,
  }),
  component: GroupLessonScreen,
});

/** As the lesson screen: the side panel needs room for the sidebar, the column and itself. */
const WIDE = '(min-width: 80rem)';

/**
 * Another member's lesson in a shared series (wireframes/sharing.md "Lesson in a group"): its
 * details, read-only, then the group thread, or the user's own notes on it (decision 99), in a
 * lesson of their own made when they first write there. Its owner opens it as their own lesson.
 */
function GroupLessonScreen() {
  const { groupId, lessonId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const me = useAccount().data?.id;
  const lesson = useLiveQuery(async () => (await db.groupLesson.get(lessonId)) ?? null, [lessonId]);
  const [ownId, setOwnId] = useState<string | null>(null);
  useEffect(() => {
    if (me) void ownLessonId(me, lessonId).then(setOwnId);
  }, [me, lessonId]);
  const place = useLiveQuery(
    async () => (lesson && ownId ? memberThread(lesson, ownId) : null),
    [lesson, ownId],
  );

  if (lesson === undefined) return <ScreenSkeleton />;
  if (lesson === null || lesson.groupId !== groupId) {
    return <NotFoundScreen>This lesson isn’t in the group any more.</NotFoundScreen>;
  }
  if (me && lesson.userId === me) {
    return <Navigate to="/lessons/$lessonId" params={{ lessonId }} search={search} replace />;
  }
  const details = [longDate(lesson.date), KIND_LABELS[lesson.kind], lesson.speaker, lesson.church];
  const mode = search.thread ?? 'group';
  return (
    <div className="flex flex-col gap-2">
      <ScreenTitle>{lesson.title}</ScreenTitle>
      <p className="text-sm text-muted-foreground">{details.filter(Boolean).join(' · ')}</p>
      {lesson.mainPassages.length > 0 && (
        <p>{lesson.mainPassages.map((ref) => formatPassage(ref)).join('; ')}</p>
      )}
      <ThreadSwitch
        value={mode}
        onChange={(next) =>
          void navigate({ search: (prev) => ({ ...prev, thread: next }), replace: true })
        }
      />
      {place && me ? (
        mode === 'group' ? (
          <InThread place={place} me={me} answer={search.groupAnswer} />
        ) : (
          <MyNotes place={place} />
        )
      ) : (
        <ScreenSkeleton />
      )}
    </div>
  );
}

/** The group thread, its questions in the side panel on a laptop, under it on a phone. */
function InThread({ place, me, answer }: { place: ThreadPlace; me: string; answer?: string }) {
  const wide = useMediaQuery(WIDE);
  const thread = useGroupThread(place, me, answer);
  if (!thread.view) return null;
  const questions = (
    <GroupQuestions
      place={place}
      questions={thread.view.questions}
      onAnswer={(question) => thread.answer(question)}
    />
  );
  return (
    <>
      <div className="mt-4">
        <GroupThread place={place} view={thread.view} request={thread.request} />
      </div>
      {wide ? <SidePanel>{questions}</SidePanel> : <div className="mt-8">{questions}</div>}
    </>
  );
}

/**
 * The user's own notes on the lesson, private: sections, takeaways and questions, as in a lesson
 * of their own. The lesson is made the first time they touch anything here.
 */
function MyNotes({ place }: { place: ThreadPlace }) {
  const wide = useMediaQuery(WIDE);
  const takeaways = useRef<PanelApi>(null);
  const questions = useRef<QuestionsApi>(null);
  const [request, setRequest] = useState<SectionRequest>();
  const made = useRef(false);
  const ensure = () => {
    if (made.current || !place.own) return;
    made.current = true;
    runWrite(ensureOwnLesson(place.own), 'a lesson');
  };
  const lessonId = place.ownLessonId;
  const extras = (
    <>
      <Takeaways ref={takeaways} lessonId={lessonId} hideWhenEmpty={!wide} />
      <Questions
        ref={questions}
        lessonId={lessonId}
        privateOnly
        hideWhenEmpty={!wide}
        onAnswer={(questionId) =>
          setRequest((r) => ({
            kind: 'answer',
            questionId,
            partial: false,
            seq: (r?.seq ?? 0) + 1,
          }))
        }
        onShowAnswer={(sectionId) =>
          setRequest((r) => ({ kind: 'reveal', sectionId, seq: (r?.seq ?? 0) + 1 }))
        }
      />
    </>
  );
  return (
    // Anything touched here writes in the user's own lesson: it's made first.
    <div
      className={cn('flex flex-col gap-2', !wide && 'pb-20')}
      onPointerDownCapture={ensure}
      onFocusCapture={ensure}
    >
      <div className="mt-4">
        <SectionList
          lessonId={lessonId}
          sourceStartedAt={null}
          sourceUrl={null}
          focusFirst={0}
          request={request}
          onSavingChange={() => {}}
          group={{ id: place.groupId, name: place.groupName }}
        />
      </div>
      {wide ? (
        <SidePanel>
          <div className="flex flex-col gap-8">{extras}</div>
        </SidePanel>
      ) : (
        <>
          <div className="mt-8 flex flex-col gap-8 empty:hidden">{extras}</div>
          <AddButton
            onAddTakeaway={() => takeaways.current?.add()}
            onAddQuestion={() => questions.current?.add()}
            onRevisitQuestion={() => questions.current?.revisit()}
          />
        </>
      )}
    </div>
  );
}
