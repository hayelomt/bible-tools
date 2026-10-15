import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  type PrecacheEntry,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { REMINDER_TAG, weeklyReminder } from './data/reminder.ts';
import { countWaiting, type QueueRows } from './data/review-count.ts';
import { today } from './lib/dates.ts';

/**
 * The service worker (TECH-DESIGN §8.6): the app shell is precached, so every screen opens offline.
 * `/api` goes to the network, and `/bible` is read by the page from its own cache. A new version
 * waits until the page asks it to take over (`UpdatePrompt`), never by itself.
 */
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (PrecacheEntry | string)[] };

/** Periodic Background Sync (Chromium only), which TypeScript's lib leaves out. */
interface PeriodicSyncEvent extends ExtendableEvent {
  readonly tag: string;
}

/** `LOOKS_CACHE` in src/lib/looks.ts, which the worker can't import (it pulls in React). */
const LOOKS_CACHE = 'lamp-looks';
/** A downloaded look's built stylesheet or font (the precache leaves them out). */
const LOOK_FILE =
  /^\/assets\/(folio|soft|lamplight|fraunces|inter-tight|jetbrains-mono)-[\w-]+\.(css|woff2)$/;

// Workbox's injection point, named by Workbox.
// oxlint-disable-next-line no-underscore-dangle
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// The chosen look's stylesheet and fonts, from the copy the page stores (src/lib/looks.ts), so
// the inline script's <link> works offline. Anything not stored goes to the network, except that
// <link> (`?stored`): it blocks the first paint, so on a slow connection the page would show
// nothing until the request gave up. It fails at once instead; the page starts in Classic and
// links the look itself.
registerRoute(
  ({ url }) => url.origin === self.location.origin && LOOK_FILE.test(url.pathname),
  async ({ request, url }) => {
    if (url.searchParams.has('stored')) {
      return (await caches.match(url.pathname, { cacheName: LOOKS_CACHE })) ?? Response.error();
    }
    return (await caches.match(request, { cacheName: LOOKS_CACHE })) ?? fetch(request);
  },
);

// Every address in the app is the same page; the router shows the screen.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//, /^\/bible\//],
  }),
);

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// The weekly reminder (TECH-DESIGN §8.8): registered from Settings where the browser can, it reads
// the review queue on the device and says what waits, or nothing. The icon's badge shows the count.
self.addEventListener('periodicsync', (event: Event) => {
  const { tag } = event as PeriodicSyncEvent;
  if (tag !== REMINDER_TAG) return;
  (event as PeriodicSyncEvent).waitUntil(remind());
});

async function remind() {
  const rows = await readQueue().catch(() => null);
  const reminder = rows && weeklyReminder(countWaiting(rows, today()));
  if (!reminder) return;
  await self.navigator.setAppBadge?.(reminder.count).catch(() => {});
  await self.registration.showNotification(reminder.title, {
    body: reminder.body,
    tag: REMINDER_TAG,
    icon: '/icon-192.png',
    data: { url: '/review' },
  });
}

/**
 * The rows the queue is counted from, read with IndexedDB itself: Dexie would make the worker
 * several times bigger. Opened without a version, so it never upgrades the page's database.
 */
async function readQueue(): Promise<QueueRows> {
  const open = indexedDB.open('lamp');
  // No database yet: nothing to count, and none is made here.
  open.addEventListener('upgradeneeded', () => open.transaction?.abort());
  const db = await settled(open);
  try {
    const tx = db.transaction(['question', 'lesson', 'memoryItem']);
    const [questions, lessons, items] = await Promise.all([
      settled(tx.objectStore('question').getAll()),
      settled(tx.objectStore('lesson').getAll()),
      settled(tx.objectStore('memoryItem').getAll()),
    ]);
    return { questions, lessons, items } as QueueRows;
  } finally {
    db.close();
  }
}

function settled<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.addEventListener('success', () => resolve(req.result));
    req.addEventListener('error', () => reject(req.error));
  });
}

// The reminder opens Review, in the app's window if it's open.
self.addEventListener('notificationclick', (event) => {
  if (event.notification.tag !== REMINDER_TAG) return;
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows[0];
      if (open) {
        await open.focus();
        await open.navigate('/review').catch(() => {});
      } else {
        await self.clients.openWindow('/review');
      }
    })(),
  );
});

// The first install controls the page it was installed from, so it works offline at once.
clientsClaim();
