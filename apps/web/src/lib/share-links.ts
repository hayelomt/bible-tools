import { type Passage, passageSlug, type ShareLink } from '@lamp/domain';
import { type QueryClient, useQuery } from '@tanstack/react-query';
import { fetchShareLinks } from './api.ts';
import { today } from './dates.ts';

/**
 * Share links (F34, M13-04, wireframes/sharing.md): kept on the server, never synced, so they're
 * listed online only. Settings → Shared links and the Share dialog read the same list.
 */

/** What a link shows: a lesson, a series or a handout by id, or a compile view by passage. */
export type ShareTarget =
  | { targetType: 'lesson' | 'series' | 'handout'; targetId: string }
  | { targetType: 'compile'; passage: Passage };

const linksKey = (userId: string) => ['shareLinks', userId] as const;

export function useShareLinks(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: linksKey(userId ?? ''),
    queryFn: fetchShareLinks,
    enabled: !!userId && enabled,
    retry: false,
  });
}

/** Asks the server for the list again, after a link is made or revoked. */
export function refreshShareLinks(queryClient: QueryClient, userId: string) {
  return queryClient.invalidateQueries({ queryKey: linksKey(userId) });
}

/** Whether a link's expiry has passed. */
export const isExpired = (link: ShareLink, now = new Date()) =>
  link.expiresAt !== null && Date.parse(link.expiresAt) <= now.getTime();

/** The target's working link, if it has one: one link per target. */
export function linkFor(
  links: readonly ShareLink[],
  target: ShareTarget,
  now = new Date(),
): ShareLink | undefined {
  return links.find(
    (link) =>
      link.targetType === target.targetType &&
      !isExpired(link, now) &&
      (target.targetType === 'compile'
        ? link.passage !== null && passageSlug(link.passage) === passageSlug(target.passage)
        : link.targetId === target.targetId),
  );
}

export const EXPIRIES = ['never', 'week', 'month', 'date'] as const;
export type Expiry = (typeof EXPIRIES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When a link made now stops working: never, in 7 or 30 days, or at the end of a picked day on
 * this device. Null for never, or for a picked day that isn't after today.
 */
export function expiresAt(expiry: Expiry, day: string, now = new Date()): string | null {
  switch (expiry) {
    case 'never':
      return null;
    case 'week':
      return new Date(now.getTime() + 7 * DAY_MS).toISOString();
    case 'month':
      return new Date(now.getTime() + 30 * DAY_MS).toISOString();
    case 'date': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day <= today(now)) return null;
      const [y, m, d] = day.split('-').map(Number) as [number, number, number];
      return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
    }
  }
}

/** The day on this device a moment falls on, for the date labels. */
export const localDay = (iso: string) => today(new Date(iso));

/** Its kind, as Settings → Shared links heads each row: "LESSON", "COMMENTARY". */
export const TARGET_LABELS: Record<ShareLink['targetType'], string> = {
  lesson: 'Lesson',
  series: 'Series',
  compile: 'Commentary',
  handout: 'Handout',
};
