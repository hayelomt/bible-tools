import { toast } from '@lamp/ui/components/sonner';
import type { AddChoice } from '@/components/reader/add-to-lesson.tsx';
import {
  appendToSection,
  dismissInboxItems,
  type Placement,
  type Promoted,
  promoteInboxItem,
  restoreInboxItems,
  restoreSnoozes,
  sendToLesson,
  snoozeInboxItems,
  tagInboxItems,
  undoPlacement,
  untagInboxItems,
} from '@/data/actions/inbox.ts';
import type { PromoteTarget } from '@/data/actions/highlights.ts';
import { shortDate, today } from '@/lib/dates.ts';
import { count } from '@/lib/labels.ts';
import { runWrite } from '@/lib/run-write.ts';

/**
 * The inbox's actions on one item or several (F27, wireframes/sermon.md "Inbox triage"): each is
 * one write with one toast and one Undo, "3 items sent to The Good Shepherd. [ Undo ]". The
 * selection is the confirmation, so none of them asks first.
 */

const WHAT = 'an inbox item';
const UNDO_MS = 10_000;

function withUndo(message: string, undo: () => Promise<unknown>) {
  toast(message, {
    duration: UNDO_MS,
    action: { label: 'Undo', onClick: () => runWrite(undo(), WHAT) },
  });
}

export const targetOf = (choice: AddChoice, title?: string): PromoteTarget =>
  choice === 'new' ? { newLesson: { date: today(), ...(title && { title }) } } : choice;

/** "Sent to The Good Shepherd.", "3 items sent to The Good Shepherd.", "Added to …" */
function placed(placement: Placement) {
  const { title } = placement.lesson;
  const message =
    placement.kind === 'append'
      ? `Added to ${title}.`
      : placement.placed.length === 1
        ? `Sent to ${title}.`
        : `${count(placement.placed.length, 'item')} sent to ${title}.`;
  withUndo(message, () => undoPlacement(placement));
}

/** Send to lesson: each item a section at the end, in the order received. */
export function sendItems(
  ids: readonly string[],
  target: PromoteTarget,
  onDone?: (placement: Placement) => void,
): void {
  runWrite(
    sendToLesson(ids, target).then((placement) => {
      placed(placement);
      onDone?.(placement);
    }),
    WHAT,
  );
}

export function appendItem(id: string, sectionId: string): void {
  runWrite(appendToSection(id, sectionId).then(placed), WHAT);
}

/** Make a takeaway or a question: the text on the lesson, and the item placed in it. */
export function promoteItem(
  id: string,
  target: PromoteTarget,
  as: Promoted['kind'],
  text: string,
): void {
  runWrite(
    promoteInboxItem(id, target, as, text).then((placement) => {
      const noun = as === 'takeaway' ? 'Takeaway' : 'Question';
      withUndo(`${noun} added to ${placement.lesson.title}.`, () => undoPlacement(placement));
    }),
    WHAT,
  );
}

export function dismissItems(ids: readonly string[]): void {
  runWrite(
    dismissInboxItems(ids).then((dismissed) => {
      const message =
        dismissed.length === 1 ? 'Dismissed.' : `${count(dismissed.length, 'item')} dismissed.`;
      withUndo(message, () => restoreInboxItems(dismissed));
    }),
    WHAT,
  );
}

export function tagItems(ids: readonly string[], name: string): void {
  runWrite(
    tagInboxItems(ids, name).then(({ tag, links }) => {
      const on = ids.length === 1 ? '' : ` to ${count(ids.length, 'item')}`;
      withUndo(`#${tag.name} added${on}.`, () => untagInboxItems(links));
    }),
    WHAT,
  );
}

/** Snooze until a day, or wake now (null). */
export function snoozeItems(ids: readonly string[], until: string | null): void {
  runWrite(
    snoozeInboxItems(ids, until).then((before) => {
      const many = ids.length > 1 ? `${count(ids.length, 'item')} ` : '';
      const message = until
        ? `${many ? `${many}snoozed` : 'Snoozed'} until ${shortDate(until)}.`
        : `${many ? `${many}back` : 'Back'} in the inbox.`;
      withUndo(message, () => restoreSnoozes(before));
    }),
    WHAT,
  );
}
