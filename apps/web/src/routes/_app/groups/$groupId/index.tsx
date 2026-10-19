import { Button } from '@lamp/ui/components/button';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NotFoundScreen } from '@/components/error-screen.tsx';
import { GroupMenu } from '@/components/groups/group-menu.tsx';
import { InviteDialog } from '@/components/groups/invite-dialog.tsx';
import { PageSection } from '@/components/page-section.tsx';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { ScreenActions, ScreenTitle } from '@/components/shell/slots.tsx';
import { groupQuestionQueue } from '@/data/group-thread.ts';
import { groupView } from '@/data/groups.ts';
import { useAccount } from '@/lib/account.ts';
import { afterGroupChange } from '@/lib/groups.ts';
import { count } from '@/lib/labels.ts';

export const Route = createFileRoute('/_app/groups/$groupId/')({
  staticData: { back: '/' },
  component: GroupScreen,
});

const rowClass =
  '-mx-2 flex items-center gap-2 rounded-lg px-2 py-3 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * A group's page (wireframes/sharing.md "The group page"): its series, Invite (owner), its
 * questions (M13-10) and its members. M13-11 adds its activity.
 */
function GroupScreen() {
  const { groupId } = Route.useParams();
  const account = useAccount().data;
  const view = useLiveQuery(() => groupView(groupId), [groupId]);
  const open = useLiveQuery(
    async () =>
      account
        ? (await groupQuestionQueue(groupId, account.id)).filter((q) => q.status !== 'answered')
            .length
        : 0,
    [groupId, account?.id],
  );
  const [inviting, setInviting] = useState(false);
  // A group just made or joined arrives with the next sync.
  useEffect(() => {
    if (view === null) void afterGroupChange();
  }, [view]);

  if (view === undefined) return <ScreenSkeleton />;
  if (view === null) {
    return (
      <>
        <ScreenTitle>Group not found</ScreenTitle>
        <NotFoundScreen>
          This group isn’t on this device. You may have left it, or it hasn’t synced here yet.
        </NotFoundScreen>
      </>
    );
  }
  const { group, members, series } = view;
  const owner = members.some((m) => m.userId === account?.id && m.role === 'owner');

  return (
    <div className="flex flex-col gap-8">
      <ScreenTitle>{group.name}</ScreenTitle>
      <ScreenActions>
        <GroupMenu groupId={group.id} name={group.name} owner={owner} members={members.length} />
      </ScreenActions>
      <PageSection title="Series">
        {series.length > 0 ? (
          <ul data-slot="row-list" className="flex flex-col divide-y">
            {series.map((s) => (
              <li key={s.id}>
                <Link
                  to="/groups/$groupId/series/$seriesId"
                  params={{ groupId, seriesId: s.id }}
                  className={rowClass}
                >
                  <span data-slot="row-title" className="min-w-0 flex-1 break-words">
                    {s.title}
                    <span className="text-muted-foreground"> · {count(s.lessons, 'lesson')}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No series yet. The owner adds one from the group’s ⋯.
          </p>
        )}
      </PageSection>
      {owner && (
        <Button variant="outline" className="self-start" onClick={() => setInviting(true)}>
          <UserPlus aria-hidden />
          Invite people
        </Button>
      )}
      <Link to="/groups/$groupId/questions" params={{ groupId }} className={rowClass}>
        <span className="min-w-0 flex-1">
          Questions <span className="text-muted-foreground">· {open ?? 0} open</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
      <Link to="/groups/$groupId/members" params={{ groupId }} className={rowClass}>
        <span className="min-w-0 flex-1">
          Members <span className="text-muted-foreground">· {members.length}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
      <InviteDialog
        open={inviting}
        onOpenChange={setInviting}
        groupId={group.id}
        name={group.name}
      />
    </div>
  );
}
