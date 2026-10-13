import type { Tag } from '@lamp/domain';
import { Link } from '@tanstack/react-router';

/** `#grace`, opening the tag's page: every note with it (wireframes/lessons.md "Tag page"). */
export function TagPageLink({ tag }: { tag: Pick<Tag, 'id' | 'name'> }) {
  return (
    <Link
      to="/tags/$tagId"
      params={{ tagId: tag.id }}
      className="rounded-sm underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      #{tag.name}
    </Link>
  );
}
