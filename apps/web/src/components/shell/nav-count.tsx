import { cn } from 'cn';
import { useReviewCount } from '@/components/review/use-review-count.ts';
import type { NavItem } from './nav-items.ts';

/**
 * The number on the Review tab: open questions plus verses due (wireframes/review.md). Read as
 * part of the link's name: "Review 3 waiting".
 */
export function NavCount({ to, className }: { to: NavItem['to']; className?: string }) {
  if (to !== '/review') return null;
  return <ReviewCount className={className} />;
}

function ReviewCount({ className }: { className?: string }) {
  const count = useReviewCount();
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
