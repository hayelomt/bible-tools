import type { QuestionEntryKind } from '@lamp/domain';
import {
  Circle,
  CircleCheck,
  CirclePause,
  Contrast,
  type LucideIcon,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { toast } from '@lamp/ui/components/sonner';
import { undoEntry } from '@/data/actions/questions.ts';
import type { QuestionView } from '@/data/question-status.ts';
import { shortDate, today } from '@/lib/dates.ts';
import { runWrite } from '@/lib/run-write.ts';

/**
 * How a question and its entries show (wireframes/thinking.md "Question thread"). Colour is never
 * the only signal (UX-PATTERNS): each has an icon and a name.
 */

export interface Shown {
  icon: LucideIcon;
  label: string;
}

const STATUS = {
  open: { icon: Circle, label: 'Open' },
  partial: { icon: Contrast, label: 'Partly answered' },
  answered: { icon: CircleCheck, label: 'Answered' },
  parked: { icon: CirclePause, label: 'Parked' },
} as const satisfies Record<string, Shown>;

/** A question's status as shown: open with a partial answer since is "Partly answered". */
export function statusShown(question: Pick<QuestionView, 'status' | 'partial'>): Shown {
  return question.partial ? STATUS.partial : STATUS[question.status];
}

export const ENTRY_KINDS: Record<QuestionEntryKind, Shown> = {
  asked: { icon: Circle, label: 'Asked' },
  revisited: { icon: RefreshCw, label: 'Revisited' },
  partial: { icon: Contrast, label: 'Partial' },
  answered: { icon: CircleCheck, label: 'Answered' },
  reopened: { icon: RotateCcw, label: 'Reopened' },
  parked: { icon: CirclePause, label: 'Parked' },
};

/** The local day an entry was made on: "Sun 2 Mar". */
export const entryDate = (createdAt: string): string => shortDate(today(new Date(createdAt)));

/** "Question parked." with Undo, which takes the entry back out (`undoEntry`). */
export function entryToast(message: string, entryId: string): void {
  toast(message, {
    duration: 10_000,
    action: { label: 'Undo', onClick: () => runWrite(undoEntry(entryId), 'a question') },
  });
}
