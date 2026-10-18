import { Button } from '@lamp/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@lamp/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@lamp/ui/components/dropdown-menu';
import { Input } from '@lamp/ui/components/input';
import { Label } from '@lamp/ui/components/label';
import { toast } from '@lamp/ui/components/sonner';
import { useNavigate } from '@tanstack/react-router';
import { Ellipsis } from 'lucide-react';
import { useId, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog.tsx';
import {
  mergeQuestions,
  parkQuestion,
  removeQuestion,
  reopenQuestion,
  restoreQuestion,
  splitQuestion,
  updateQuestion,
} from '@/data/actions/questions.ts';
import type { QuestionChoice, QuestionThread } from '@/data/question-thread.ts';
import { count } from '@/lib/labels.ts';
import { runWrite } from '@/lib/run-write.ts';
import { QuestionPicker } from './question-picker.tsx';
import { SplitDialog } from './split-dialog.tsx';
import { entryToast } from './labels.ts';

type Open = 'edit' | 'split' | 'merge' | null;

/**
 * The thread's `⋯` (wireframes/thinking.md): Edit, Split…, Merge with…, Park or Reopen, and
 * Delete. Split and Merge go to the question that comes out of them.
 */
export function ThreadMenu({ thread }: { thread: QuestionThread }) {
  const { question } = thread;
  const navigate = useNavigate();
  const [open, setOpen] = useState<Open>(null);
  const [mergeInto, setMergeInto] = useState<QuestionChoice | null>(null);
  const close = (isOpen: boolean) => !isOpen && setOpen(null);
  const showThread = (questionId: string) =>
    navigate({ to: '/questions/$questionId', params: { questionId }, replace: true });

  function remove() {
    runWrite(
      removeQuestion(question.id).then(() => {
        void navigate({ to: '/lessons/$lessonId', params: { lessonId: question.lessonId } });
        toast('Question deleted.', {
          duration: 10_000,
          action: {
            label: 'Undo',
            onClick: () => runWrite(restoreQuestion(question.id), 'a question'),
          },
        });
      }),
      'a question',
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label="Question actions" />}
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setOpen('edit')}>Edit</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpen('split')}>Split…</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpen('merge')}>Merge with…</DropdownMenuItem>
          {question.status === 'open' ? (
            <DropdownMenuItem
              onClick={() =>
                runWrite(
                  parkQuestion(question.id).then((e) => entryToast('Question parked.', e.id)),
                  'a question',
                )
              }
            >
              Park
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() =>
                runWrite(
                  reopenQuestion(question.id).then((e) => entryToast('Question reopened.', e.id)),
                  'a question',
                )
              }
            >
              Reopen
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={remove}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open === 'edit'} onOpenChange={close}>
        <DialogContent>
          {open === 'edit' && (
            <EditForm
              text={question.text}
              onDone={(text) => {
                if (text && text !== question.text) {
                  runWrite(updateQuestion(question.id, text), 'a question');
                }
                setOpen(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <SplitDialog
        open={open === 'split'}
        onOpenChange={close}
        thread={thread}
        onSplit={(plan) => {
          setOpen(null);
          runWrite(
            splitQuestion(question.id, plan).then((split) => showThread(split.id)),
            'a question',
          );
        }}
      />

      <QuestionPicker
        open={open === 'merge'}
        onOpenChange={close}
        title="Merge with…"
        description="The question this one becomes part of. Its entries keep their dates and lessons."
        submit="Next"
        offers={(c) => c.question.id !== question.id}
        empty="There’s no other question to merge with."
        onPick={(choice) => {
          setOpen(null);
          setMergeInto(choice);
        }}
      />
      {mergeInto && (
        <ConfirmDialog
          open
          onOpenChange={(isOpen) => !isOpen && setMergeInto(null)}
          title={`Merge “${question.text}” into “${mergeInto.question.text}”?`}
          description={`Their ${count(question.entries.length + mergeInto.question.entries.length, 'entry', 'entries')} become one thread, in date order.`}
          confirmLabel="Merge"
          variant="default"
          onConfirm={() =>
            runWrite(
              mergeQuestions(question.id, mergeInto.question.id).then(() =>
                showThread(mergeInto.question.id),
              ),
              'a question',
            )
          }
        />
      )}
    </>
  );
}

function EditForm({ text, onDone }: { text: string; onDone: (text: string) => void }) {
  const [value, setValue] = useState(text);
  const id = useId();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onDone(value.trim());
      }}
    >
      <DialogHeader>
        <DialogTitle>Edit question</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id} className="sr-only">
          Question
        </Label>
        <Input
          id={id}
          value={value}
          maxLength={2000}
          autoComplete="off"
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={!value.trim()}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
