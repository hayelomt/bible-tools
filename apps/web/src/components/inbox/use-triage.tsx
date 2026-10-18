import type { InboxItem } from '@lamp/domain';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { AppendDialog } from './append-dialog.tsx';
import {
  appendItem,
  dismissItems,
  promoteItem,
  sendItems,
  snoozeItems,
  tagItems,
  targetOf,
} from './triage-actions.ts';
import {
  MakeLessonDialog,
  PromoteDialog,
  SendDialog,
  SnoozeDateDialog,
  TagDialog,
} from './triage-dialogs.tsx';

export type TriageDialog =
  'send' | 'append' | 'takeaway' | 'question' | 'tag' | 'snooze-date' | 'lesson';

/**
 * The inbox's actions on some items, for an item's own buttons and for the selection bar alike
 * (wireframes/sermon.md "Inbox triage"). `onDone` runs once an action that takes the items out of
 * the inbox has started, so a selection can clear.
 */
export function useTriage(items: readonly InboxItem[], onDone?: () => void) {
  const [dialog, setDialog] = useState<TriageDialog | null>(null);
  const navigate = useNavigate();
  const ids = items.map((item) => item.id);
  const close = (open: boolean) => !open && setDialog(null);
  const finish = () => {
    setDialog(null);
    onDone?.();
  };
  const one = items.length === 1 ? items[0] : undefined;

  const dialogs = (
    <>
      <SendDialog
        items={items}
        open={dialog === 'send'}
        onOpenChange={close}
        onSend={(choice) => {
          finish();
          sendItems(ids, targetOf(choice));
        }}
      />
      {one && (
        <>
          <AppendDialog
            open={dialog === 'append'}
            onOpenChange={close}
            onAppend={(sectionId) => {
              finish();
              appendItem(one.id, sectionId);
            }}
          />
          <PromoteDialog
            item={one}
            as={dialog === 'question' ? 'question' : 'takeaway'}
            open={dialog === 'takeaway' || dialog === 'question'}
            onOpenChange={close}
            onPromote={(choice, text) => {
              const as = dialog === 'question' ? 'question' : 'takeaway';
              finish();
              promoteItem(one.id, targetOf(choice), as, text);
            }}
          />
        </>
      )}
      <TagDialog
        items={items}
        open={dialog === 'tag'}
        onOpenChange={close}
        onTag={(name) => tagItems(ids, name)}
      />
      <SnoozeDateDialog
        open={dialog === 'snooze-date'}
        onOpenChange={close}
        onSnooze={(until) => {
          finish();
          snoozeItems(ids, until);
        }}
      />
      <MakeLessonDialog
        items={items}
        open={dialog === 'lesson'}
        onOpenChange={close}
        onMake={(title) => {
          finish();
          sendItems(ids, targetOf('new', title), (placement) => {
            void navigate({ to: '/lessons/$lessonId', params: { lessonId: placement.lesson.id } });
          });
        }}
      />
    </>
  );

  return {
    open: setDialog,
    dialogs,
    snooze: (until: string) => {
      onDone?.();
      snoozeItems(ids, until);
    },
    dismiss: () => {
      onDone?.();
      dismissItems(ids);
    },
  };
}
