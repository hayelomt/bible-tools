import { buttonVariants } from '@lamp/ui/components/button';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { answeredLine, StatusIcon } from '@/components/groups/group-questions.tsx';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { Segmented } from '@/components/segmented.tsx';
import { ScreenTitle } from '@/components/shell/slots.tsx';
import { db } from '@/data/db.ts';
import { groupQuestionQueue } from '@/data/group-thread.ts';
import { useAccount } from '@/lib/account.ts';
import { shortDate } from '@/lib/dates.ts';
import { threadLink } from '@/lib/groups.ts';

export const Route = createFileRoute('/_app/groups/$groupId/questions')({
  staticData: { back: '..' },
  component: GroupQuestionsScreen,
});

type Tab = 'open' | 'answered';
const TABS = ['open', 'answered'] as const;

/**
 * The group's questions (F35, M13-10, wireframes/sharing.md "Group questions"): every question
 * asked in a group thread across its series, open (partly answered too) or answered, with who
 * asked and who answered. Answer opens the lesson's group thread with an answer started.
 */
function GroupQuestionsScreen() {
  const { groupId } = Route.useParams();
  const me = useAccount().data?.id;
  const [tab, setTab] = useState<Tab>('open');
  const view = useLiveQuery(async () => {
    const group = await db.group.get(groupId);
    if (!group || !me) return null;
    return { group, questions: await groupQuestionQueue(groupId, me) };
  }, [groupId, me]);
  if (view === undefined) return <ScreenSkeleton />;
  if (view === null || !me) {
    return <NotFoundScreen>This group isn’t on this device.</NotFoundScreen>;
  }
  const open = view.questions.filter((q) => q.status !== 'answered');
  const answered = view.questions.filter((q) => q.status === 'answered');
  const shown = tab === 'open' ? open : answered;
  return (
    <div className="flex flex-col gap-6">
      <ScreenTitle>Questions · {view.group.name}</ScreenTitle>
      <Segmented
        name="questions"
        options={TABS}
        labels={{ open: `Open ${open.length}`, answered: `Answered ${answered.length}` }}
        value={tab}
        onChange={setTab}
      />
      {shown.length === 0 ? (
        <p className="text-muted-foreground">
          {tab === 'open'
            ? 'No open questions in the group. Questions members add to a group thread show here.'
            : 'No answered questions yet.'}
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {shown.map((question) => {
            const line = answeredLine(question);
            return (
              <li key={question.id} className="flex items-start gap-3 py-3">
                <StatusIcon status={question.status} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Link
                    {...threadLink(groupId, question, me)}
                    className="flex items-start gap-2 rounded-md outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="min-w-0 flex-1 break-words">{question.text}</span>
                    <ChevronRight
                      className="mt-1 size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {question.author} · {question.lessonTitle} ·{' '}
                    {shortDate(question.createdAt.slice(0, 10))}
                  </p>
                  {line && <p className="text-sm text-muted-foreground">{line}</p>}
                  {question.status !== 'answered' && (
                    <Link
                      {...threadLink(groupId, question, me, question.id)}
                      className={buttonVariants({
                        variant: 'outline',
                        size: 'sm',
                        className: 'self-start',
                      })}
                    >
                      Answer
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
