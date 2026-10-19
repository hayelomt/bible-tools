import type { NewInboxItem } from '@/data/actions/inbox.ts';
import type { FoundVerse, ShareReading } from './read-share.ts';

/**
 * The inbox items for what a share or a paste holds (M9-06, M9-09): an item for each verse
 * chosen, the first with the rest of the text as its note; with no verse, the note alone.
 */
export function shareItems(
  { note, sourceUrl }: ShareReading,
  chosen: readonly FoundVerse[],
  origin: NewInboxItem['origin'],
): NewInboxItem[] {
  if (chosen.length === 0) return [{ origin, ref: null, text: note, sourceUrl }];
  return chosen.map(({ ref }, i) => ({ origin, ref, text: i === 0 ? note : null, sourceUrl }));
}
