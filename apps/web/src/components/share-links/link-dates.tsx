import type { ShareLink } from '@lamp/domain';
import { useState } from 'react';
import { agoLabel, dayAndMonth, shortDate } from '@/lib/dates.ts';
import { isExpired, localDay } from '@/lib/share-links.ts';

/**
 * A link's dates (wireframes/sharing.md): "Created Fri 17 Oct · opened 2 h ago", then "Expires
 * Sun 16 Nov", "Never expires" or, muted by the list, "Expired Wed 1 Oct".
 */
export function LinkDates({ link }: { link: ShareLink }) {
  // When it was opened: its labels don't tick on while the screen is open.
  const [now] = useState(() => new Date());
  const opened = link.lastOpenedAt ? `opened ${agoLabel(link.lastOpenedAt, now)}` : 'never opened';
  return (
    <div className="flex flex-col text-sm text-muted-foreground">
      {!isExpired(link, now) && (
        <p>
          Created {dayAndMonth(localDay(link.createdAt))} · {opened}
        </p>
      )}
      <p>{expiryLabel(link, now)}</p>
    </div>
  );
}

export function expiryLabel(link: ShareLink, now = new Date()): string {
  if (link.expiresAt === null) return 'Never expires';
  const day = shortDate(localDay(link.expiresAt), now);
  return isExpired(link, now) ? `Expired ${day}` : `Expires ${day}`;
}
