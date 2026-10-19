import { useLiveQuery } from 'dexie-react-hooks';
import { freshByGroup } from '@/data/group-activity.ts';
import { useAccount } from '@/lib/account.ts';

/** How much is new in each of the user's groups (M13-11): "2 new" on its row. */
export function useFreshByGroup(): ReadonlyMap<string, number> {
  const me = useAccount().data?.id;
  return useLiveQuery(async () => (me ? freshByGroup(me) : new Map()), [me]) ?? new Map();
}
