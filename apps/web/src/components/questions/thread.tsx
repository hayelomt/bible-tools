import { buttonVariants } from '@lamp/ui/components/button';
import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { ChevronRight } from 'lucide-react';
import { ScreenActions, ScreenTitle } from '@/components/shell/slots.tsx';
import { lineageSummary, type QuestionThread, type ThreadEntry } from '@/data/question-thread.ts';
import { ENTRY_KINDS, entryDate, statusShown } from './labels.ts';
import { ThreadMenu } from './thread-menu.tsx';

/**
 * A question's thread (F24, wireframes/thinking.md "Question thread"): its status and lineage,
 * then every entry in date order, each naming its lesson and opening it there. Answer and Add a
 * partial answer add a section to the latest entry's lesson, headed with the question.
 */
export function QuestionThreadView({ thread }: { thread: QuestionThread }) {
  const { question, splitFrom, entries, answerLesson } = thread;
  const { icon: Icon, label } = statusShown(question);
  const summary = lineageSummary(question.entries);

  return (
    <div className="flex flex-col gap-6">
      <ScreenTitle>Question</ScreenTitle>
      <ScreenActions>
        <ThreadMenu thread={thread} />
      </ScreenActions>

      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold break-words">{question.text}</h2>
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <Icon
            aria-hidden
            className={cn(
              'mt-0.5 size-4 shrink-0',
              question.status === 'answered' && 'text-primary',
            )}
          />
          <span>
            {label}
            {summary && ` · ${summary}`}
          </span>
        </p>
        {splitFrom && (
          <p className="text-sm text-muted-foreground">
            Split from “{splitFrom.text}” on {entryDate(question.createdAt)}
          </p>
        )}
      </div>

      <ol aria-label="Thread" className="flex flex-col">
        {entries.map((item) => (
          <EntryRow key={item.entry.id} item={item} />
        ))}
      </ol>

      {answerLesson && (
        <div className="flex flex-wrap gap-2">
          <Link
            to="/lessons/$lessonId"
            params={{ lessonId: answerLesson.id }}
            search={{ answer: question.id, partial: true }}
            data-slot="button"
            className={buttonVariants({ variant: 'outline', className: 'pointer-coarse:min-h-11' })}
          >
            Add a partial answer
          </Link>
          <Link
            to="/lessons/$lessonId"
            params={{ lessonId: answerLesson.id }}
            search={{ answer: question.id }}
            data-slot="button"
            className={buttonVariants({ className: 'pointer-coarse:min-h-11' })}
          >
            Answer
          </Link>
        </div>
      )}
    </div>
  );
}

function EntryRow({ item: { entry, lesson, section } }: { item: ThreadEntry }) {
  const { icon: Icon, label } = ENTRY_KINDS[entry.kind];
  return (
    <li className="flex gap-3 py-2">
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label} · {entryDate(entry.createdAt)}
        </span>
        {lesson ? (
          <Link
            to="/lessons/$lessonId"
            params={{ lessonId: lesson.id }}
            search={section ? { section: section.id } : {}}
            className="-mx-2 flex items-start gap-2 rounded-lg px-2 py-1 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
          >
            <span className="min-w-0 flex-1">
              <span className="block break-words">{lesson.title}</span>
              {section?.words && (
                <span className="block text-sm text-muted-foreground break-words">
                  {section.words}
                </span>
              )}
            </span>
            <ChevronRight aria-hidden className="mt-1 size-4 shrink-0 text-muted-foreground" />
          </Link>
        ) : (
          <p className="py-1 text-muted-foreground">A deleted lesson</p>
        )}
      </div>
    </li>
  );
}
