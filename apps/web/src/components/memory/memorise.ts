import { type MemoryItem, type Passage, passageSlug, type VerseRef } from '@lamp/domain';
import { toast } from '@lamp/ui/components/sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  memoryItemFor,
  memorise,
  removeMemoryItem,
  restoreMemoryItem,
} from '@/data/actions/memory.ts';
import { today } from '@/lib/dates.ts';
import { reportWriteError, runWrite } from '@/lib/run-write.ts';

/** The memory item for exactly `passage`, null when there's none; undefined while it's read. */
export function useMemoryItem(passage: Passage | null): MemoryItem | null | undefined {
  const key = passage ? passageSlug(passage) : '';
  return useLiveQuery(
    async () => (passage ? ((await memoryItemFor(passage)) ?? null) : null),
    [key],
  );
}

/** A chip's reference without the nulls the editor keeps for missing fields. */
export function storedRef(ref: VerseRef): VerseRef {
  return Object.fromEntries(Object.entries(ref).filter(([, value]) => value != null)) as VerseRef;
}

/**
 * "Memorise" from the reader or a chip (wireframes/review.md "Memorise"): added at once, with a
 * toast that offers Undo.
 */
export function memoriseVerse(ref: VerseRef): Promise<void> {
  return memorise(storedRef(ref), today()).then(
    ({ item, added }) => {
      if (!added) return;
      toast(`${ref.display} added to memory verses.`, {
        duration: 10_000,
        action: {
          label: 'Undo',
          onClick: () => runWrite(removeMemoryItem(item.id), 'a memory verse'),
        },
      });
    },
    (error: unknown) => reportWriteError(error, 'a memory verse'),
  );
}

/** Remove from the verse index, with Undo (UX-PATTERNS "Confirmations"). */
export function forgetVerse(item: MemoryItem): void {
  runWrite(
    removeMemoryItem(item.id).then(() => {
      toast(`${item.ref.display} removed from memory verses.`, {
        duration: 10_000,
        action: {
          label: 'Undo',
          onClick: () => runWrite(restoreMemoryItem(item.id), 'a memory verse'),
        },
      });
    }),
    'a memory verse',
  );
}
