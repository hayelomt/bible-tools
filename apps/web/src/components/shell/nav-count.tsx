import { cn } from 'cn';
import { useInboxCount } from '@/components/inbox/inbox-count.ts';
import { useReviewCount } from '@/components/review/review-count.tsx';
import type { NavItem } from './nav-items.ts';

/**
 * The number on the Inbox tab (items waiting) and the Review tab (open questions plus verses due),
 * wireframes/shell.md. Read as part of the link's name: "Review 3 waiting".
 */
export function NavCount({ to, className }: { to: NavItem['to']; className?: string }) {
  if (to === '/inbox') return <InboxCount className={className} />;
  if (to === '/review') return <ReviewCount className={className} />;
  return null;
}

function InboxCount({ className }: { className?: string }) {
  return <Count count={useInboxCount()} className={className} />;
}

function ReviewCount({ className }: { className?: string }) {
  return <Count count={useReviewCount()} className={className} />;
}

function Count({ count, className }: { count: number | undefined; className?: string }) {
  if (!count) return null;
  return (
    <span
      data-slot="nav-count"
      className={cn(
        'min-w-4 rounded-full bg-primary px-1 text-center text-[11px] leading-4 font-medium text-primary-foreground tabular-nums',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
      <span className="sr-only"> waiting</span>
    </span>
  );
}
