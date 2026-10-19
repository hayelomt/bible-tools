import { newId } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@lamp/ui/components/dropdown-menu';
import { toast } from '@lamp/ui/components/sonner';
import { cn } from 'cn';
import { Ellipsis } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ReadOnlyBody } from '@/components/compile/read-only-body.tsx';
import { VerseViewer } from '@/components/verses/verse-viewer.tsx';
import {
  answerInGroup,
  moveToMyNotes,
  reshare,
  type ThreadTarget,
} from '@/data/actions/group-thread.ts';
import { removeSection, restoreSections } from '@/data/actions/sections.ts';
import type { ThreadEntry, ThreadItem, ThreadPlace, ThreadView } from '@/data/group-thread.ts';
import { shortDate } from '@/lib/dates.ts';
import { runWrite } from '@/lib/run-write.ts';
import { Comments } from './comments.tsx';
import { type ThreadDraft, ThreadEditor } from './thread-editor.tsx';

/** An answer to a group question, asked of the thread (the queue's or the panel's Answer). */
export interface AnswerRequest {
  questionId: string;
  text: string;
  partial: boolean;
  seq: number;
}

interface GroupThreadProps {
  place: ThreadPlace;
  view: ThreadView;
  request?: AnswerRequest;
}

/** Where the thread's writes go. */
export const targetOf = (place: ThreadPlace): ThreadTarget => ({
  groupId: place.groupId,
  lessonId: place.ownLessonId,
  own: place.own,
});

/**
 * A lesson's group thread (F35, M13-08, wireframes/sharing.md "Lesson in a group"): every member's
 * group sections, each with its author and date, by when it was shared, replies under what they
 * reply to, and each with its comments (M13-09). The user's own edit as they're typed; others' are
 * read-only. New sections at the end, "Add to the group thread…", are public.
 */
export function GroupThread({ place, view, request }: GroupThreadProps) {
  const target = targetOf(place);
  // The section a reply is being written under, and the draft at the end, made again once stored.
  const [replying, setReplying] = useState<{ to: ThreadEntry; draft: ThreadDraft } | null>(null);
  const [endDraft, setEndDraft] = useState(newId);
  const [focusId, setFocusId] = useState<string | null>(null);

  const handled = useRef(0);
  useEffect(() => {
    if (!request || request.seq === handled.current) return;
    handled.current = request.seq;
    const id = newId();
    runWrite(
      answerInGroup(
        target,
        { id: request.questionId, text: request.text },
        { id, partial: request.partial },
      ).then(() => setFocusId(id)),
      'an answer',
    );
    // A request is handled once; the target follows from it.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  useEffect(() => {
    if (!focusId) return;
    document
      .querySelector(`[data-thread-section="${focusId}"]`)
      ?.scrollIntoView({ block: 'center' });
  }, [focusId, view]);

  const reply = (to: ThreadEntry) =>
    setReplying({
      to,
      draft: {
        id: newId(),
        // To one's own section, a reply in the same lesson; to another member's, one that names it.
        fields: to.mine ? { parentId: to.parentId ?? to.id } : { replyToId: to.id },
      },
    });

  return (
    <div className="flex flex-col gap-6">
      <VerseViewer />
      {view.items.length === 0 && (
        <p className="text-muted-foreground">
          Nothing in the group thread yet. What you add here, the group sees.
        </p>
      )}
      {/* A draft being typed stays in its editor until focus leaves it, so no keystroke is lost. */}
      {view.items
        .filter((item) => item.entry.id !== endDraft)
        .map((item) => (
          <ThreadCard
            key={item.entry.id}
            item={item}
            place={place}
            view={view}
            focusId={focusId}
            onReply={reply}
            replying={
              replying &&
              (replying.to.id === item.entry.id ||
                item.replies.some((r) => r.id === replying.to.id))
                ? replying.draft
                : null
            }
            onReplied={() => setReplying(null)}
          />
        ))}
      <div className="border-l-2 border-primary/40 pl-3">
        <ThreadEditor
          key={endDraft}
          section={null}
          draft={{ id: endDraft, fields: {} }}
          target={target}
          label="Add to the group thread"
          placeholder="Add to the group thread…"
          onLeave={(stored) => {
            if (stored) setEndDraft(newId());
          }}
        />
      </div>
    </div>
  );
}

function ThreadCard({
  item,
  place,
  view,
  focusId,
  replying,
  onReply,
  onReplied,
}: {
  item: ThreadItem;
  place: ThreadPlace;
  view: ThreadView;
  focusId: string | null;
  replying: ThreadDraft | null;
  onReply: (to: ThreadEntry) => void;
  onReplied: () => void;
}) {
  return (
    <article className="flex flex-col gap-3 border-l-2 border-primary/40 pl-3">
      <Entry
        entry={item.entry}
        place={place}
        view={view}
        focused={focusId === item.entry.id}
        onReply={onReply}
      />
      {item.replies.some((r) => r.id !== replying?.id) && (
        <div className="ml-4 flex flex-col gap-3 border-l pl-3">
          {item.replies
            .filter((r) => r.id !== replying?.id)
            .map((entry) => (
              <Entry
                key={entry.id}
                entry={entry}
                place={place}
                view={view}
                focused={focusId === entry.id}
                onReply={onReply}
              />
            ))}
        </div>
      )}
      {replying && (
        <div className="ml-4 border-l pl-3">
          <ThreadEditor
            key={replying.id}
            section={null}
            draft={replying}
            target={targetOf(place)}
            label="Reply"
            placeholder="Write a reply…"
            focusOnMount
            onLeave={onReplied}
          />
        </div>
      )}
    </article>
  );
}

function Entry({
  entry,
  place,
  view,
  focused,
  onReply,
}: {
  entry: ThreadEntry;
  place: ThreadPlace;
  view: ThreadView;
  focused: boolean;
  onReply: (to: ThreadEntry) => void;
}) {
  return (
    <div data-thread-section={entry.id} className="flex flex-col gap-1">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {entry.author} · {shortDate(entry.sharedAt.slice(0, 10))}
        </p>
        <EntryMenu entry={entry} place={place} onReply={onReply} />
      </div>
      {entry.section ? (
        <ThreadEditor
          section={entry.section}
          target={targetOf(place)}
          label={entry.parentId || entry.replyToId ? 'Reply' : 'Note'}
          placeholder="Write a note…"
          focusOnMount={focused}
        />
      ) : (
        <div className={cn('text-[17px] leading-[1.6]')}>
          <ReadOnlyBody body={entry.body} headingLevel={4} />
        </div>
      )}
      <Comments
        sectionId={entry.id}
        groupId={place.groupId}
        comments={view.comments.get(entry.id) ?? []}
      />
    </div>
  );
}

/** Reply, and for the user's own: Move to my notes, Delete. */
function EntryMenu({
  entry,
  place,
  onReply,
}: {
  entry: ThreadEntry;
  place: ThreadPlace;
  onReply: (to: ThreadEntry) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={entry.mine ? 'Section actions' : `Actions for ${entry.author}'s section`}
          />
        }
      >
        <Ellipsis />
      </DropdownMenuTrigger>
      {/* Reply puts the cursor in the reply, not back on this button. */}
      <DropdownMenuContent align="end" finalFocus={false} className="w-48">
        <DropdownMenuItem onClick={() => onReply(entry)}>Reply</DropdownMenuItem>
        {entry.mine && (
          <>
            {/* A reply goes with its section: only a whole section moves. */}
            {entry.parentId === null && (
              <DropdownMenuItem
                onClick={() =>
                  runWrite(
                    moveToMyNotes(entry.id).then((ids) =>
                      toast('Moved to your notes.', {
                        duration: 10_000,
                        action: {
                          label: 'Undo',
                          onClick: () => runWrite(reshare(ids, place.groupId), 'a section'),
                        },
                      }),
                    ),
                    'a section',
                  )
                }
              >
                Move to my notes
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() =>
                runWrite(
                  removeSection(entry.id, { withReplies: true }).then((removed) =>
                    toast('Deleted from the group thread.', {
                      duration: 10_000,
                      action: {
                        label: 'Undo',
                        onClick: () => runWrite(restoreSections(removed), 'a section'),
                      },
                    }),
                  ),
                  'a section',
                )
              }
            >
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
