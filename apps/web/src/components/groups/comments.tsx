import { commentBody, commentBodySchema, commentText, MAX_COMMENT_LENGTH } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@lamp/ui/components/dropdown-menu';
import { toast } from '@lamp/ui/components/sonner';
import { Textarea } from '@lamp/ui/components/textarea';
import { ChevronDown, EllipsisVertical } from 'lucide-react';
import { useId, useState } from 'react';
import { ReadOnlyBody } from '@/components/compile/read-only-body.tsx';
import {
  addComment,
  editComment,
  removeComment,
  restoreComment,
} from '@/data/actions/group-thread.ts';
import type { ThreadComment } from '@/data/group-thread.ts';
import { shortDate } from '@/lib/dates.ts';
import { count } from '@/lib/labels.ts';
import { runWrite } from '@/lib/run-write.ts';

/** Why a comment can't be posted as typed, or null. */
function problemOf(text: string): string | null {
  if (text.trim() === '') return null;
  if (!commentBodySchema.safeParse(commentBody(text)).success) {
    return `A comment holds at most ${MAX_COMMENT_LENGTH.toLocaleString()} characters.`;
  }
  return null;
}

/**
 * A comment box (wireframes/sharing.md "Comments"): plain text, whose references become verse
 * chips when it's posted (decided 2026-10-19). Enter posts; Shift+Enter is a new line.
 */
function CommentBox({
  label,
  initial = '',
  submit,
  onSubmit,
  onCancel,
}: {
  label: string;
  initial?: string;
  submit: string;
  onSubmit: (text: string) => void;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(initial);
  const errorId = useId();
  const problem = problemOf(text);
  const send = () => {
    if (text.trim() === '' || problem) return;
    onSubmit(text);
    setText('');
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-2">
        <Textarea
          value={text}
          rows={1}
          aria-label={label}
          placeholder={`${label}…`}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? errorId : undefined}
          className="min-h-9"
          // oxlint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={initial !== ''}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && onCancel) onCancel();
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            send();
          }}
        />
        <Button size="sm" variant="outline" disabled={!text.trim() || !!problem} onClick={send}>
          {submit}
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      {problem && (
        <p id={errorId} className="text-sm text-destructive">
          {problem}
        </p>
      )}
    </div>
  );
}

function CommentRow({ comment }: { comment: ThreadComment }) {
  const [editing, setEditing] = useState(false);
  return (
    <li className="flex flex-col gap-1" data-comment={comment.id}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {comment.author} · {shortDate(comment.createdAt.slice(0, 10))}
        </p>
        {comment.mine && !editing && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" aria-label="Comment actions" />}
            >
              <EllipsisVertical />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => setEditing(true)}>Edit</DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  runWrite(removeComment(comment.id), 'a comment');
                  toast('Comment deleted.', {
                    duration: 10_000,
                    action: {
                      label: 'Undo',
                      onClick: () => runWrite(restoreComment(comment.id), 'a comment'),
                    },
                  });
                }}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {editing ? (
        <CommentBox
          label="Edit comment"
          initial={commentText(comment.body)}
          submit="Save"
          onCancel={() => setEditing(false)}
          onSubmit={(text) => {
            setEditing(false);
            runWrite(editComment(comment.id, text), 'a comment');
          }}
        />
      ) : (
        // A comment's body is a section body of paragraphs, text and chips.
        <ReadOnlyBody body={comment.body as never} headingLevel={5} />
      )}
    </li>
  );
}

/**
 * A group section's comments (M13-09), folded under it until opened: "2 comments", or "No
 * comments · Comment".
 */
export function Comments({
  sectionId,
  groupId,
  comments,
}: {
  sectionId: string;
  groupId: string;
  comments: readonly ThreadComment[];
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="-mx-1 flex w-fit items-center gap-1 rounded-md px-1 text-sm text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
      >
        {comments.length > 0 ? count(comments.length, 'comment') : 'No comments · Comment'}
        <ChevronDown
          aria-hidden
          className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div id={listId} className="flex flex-col gap-3 pl-3">
          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No comments yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {comments.map((comment) => (
                <CommentRow key={comment.id} comment={comment} />
              ))}
            </ul>
          )}
          <CommentBox
            label="Add a comment"
            submit="Post"
            onSubmit={(text) => runWrite(addComment(sectionId, groupId, text), 'a comment')}
          />
        </div>
      )}
    </div>
  );
}
