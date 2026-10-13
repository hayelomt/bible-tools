import { type Device, devicesResponseSchema } from '@lamp/domain';
import { type QueryClient, useQuery } from '@tanstack/react-query';
import { fetchDevices } from './api.ts';

/**
 * The last devices list the server sent, so offline the list (and its count) still shows, marked
 * as needing a connection to update (wireframes/account.md "Devices"). Kept with the account it
 * belongs to.
 */
const MIRROR_KEY = 'lamp.devices';
/** Asked again at most this often by the count in the sync panel and settings. */
const STALE_MS = 60_000;

const devicesKey = (userId: string) => ['devices', userId] as const;

function readMirror(userId: string): Device[] | undefined {
  try {
    const stored = JSON.parse(localStorage.getItem(MIRROR_KEY) ?? '') as {
      userId?: unknown;
      devices?: unknown;
    };
    if (stored.userId !== userId) return undefined;
    const parsed = devicesResponseSchema.safeParse({ devices: stored.devices });
    return parsed.success ? parsed.data.devices : undefined;
  } catch {
    return undefined;
  }
}

function writeMirror(userId: string, devices: Device[]) {
  try {
    localStorage.setItem(MIRROR_KEY, JSON.stringify({ userId, devices }));
  } catch {
    // Storage refused: the list is fetched again next time.
  }
}

/** The devices signed in to the account (§6.6), from the server, or its last copy offline. */
export function useDevices(userId: string | undefined) {
  return useQuery({
    queryKey: devicesKey(userId ?? ''),
    queryFn: async () => {
      const devices = await fetchDevices();
      writeMirror(userId!, devices);
      return devices;
    },
    enabled: !!userId,
    initialData: () => (userId ? readMirror(userId) : undefined),
    initialDataUpdatedAt: 0,
    staleTime: STALE_MS,
    retry: false,
  });
}

/** Takes a signed-out device off the list at once, then asks the server again. */
export function forgetDevice(queryClient: QueryClient, userId: string, deviceId: string) {
  const key = devicesKey(userId);
  const left = queryClient.getQueryData<Device[]>(key)?.filter((d) => d.id !== deviceId);
  if (left) {
    queryClient.setQueryData(key, left);
    writeMirror(userId, left);
  }
  return queryClient.invalidateQueries({ queryKey: key });
}
